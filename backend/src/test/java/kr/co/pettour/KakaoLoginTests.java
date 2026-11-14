package kr.co.pettour;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "tour.api-key=")
class KakaoLoginTests {
    private static final String REDIRECT = "http://localhost:5173/api/auth/kakao/callback";
    private static final long KAKAO_USER_ID = 9_007_199_254_740_993L;
    @TempDir static Path dataDir;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("auth.members-file", () -> dataDir.resolve("members.json").toString());
        registry.add("auth.sessions-file", () -> dataDir.resolve("auth-sessions.json").toString());
        registry.add("community.store", () -> dataDir.resolve("courses.json").toString());
        registry.add("kakao.login.redirect-uri", () -> REDIRECT);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Provider {
        private final RestClient.Builder builder = RestClient.builder();
        private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        @Bean MockRestServiceServer kakaoMock() { return server; }

        @Bean @Primary KakaoLoginClient testKakaoClient() {
            return new KakaoLoginClient("test-key", "test-secret", REDIRECT, builder.build());
        }
    }

    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired MockRestServiceServer provider;
    @Autowired CsvFacilities csv;
    private final HttpClient browser = HttpClient.newHttpClient();

    record Attempt(String cookie, String state, String challenge) {}

    @BeforeEach void resetProvider() { provider.reset(); }
    @AfterEach void verifyProvider() { provider.verify(); }

    @Test void registersOnceAndLogsInAgainAfterLogout() throws Exception {
        var guest = session(null);
        assertTrue(guest.path("enabled").asBoolean());
        assertTrue(guest.path("user").isNull());
        assertFalse(guest.path("dogSetupPending").asBoolean());
        assertEquals(401, call("POST", "/dogs/skip-setup", null, true).statusCode());

        var first = start("community");
        permitSignIn(first, "보리 보호자");
        var callback = callback(first, "code=approved");
        assertRedirect("/#community", callback);
        String authenticated = cookie(callback);
        assertNotEquals(first.cookie(), authenticated);
        assertTrue(session(first.cookie()).path("user").isNull());
        var member = session(authenticated).path("user");
        assertFalse(member.path("id").asString("").isEmpty());
        assertEquals("보리 보호자", member.path("nickname").asString());
        assertFalse(member.has("kakaoId"));
        assertTrue(session(authenticated).path("dogSetupPending").asBoolean());
        assertEquals(403, call("POST", "/dogs/skip-setup", authenticated, false).statusCode());
        assertTrue(session(authenticated).path("dogSetupPending").asBoolean());
        assertEquals(204, call("POST", "/dogs/skip-setup", authenticated, true).statusCode());
        assertFalse(session(authenticated).path("dogSetupPending").asBoolean());
        assertEquals(0, json(200, call("GET", "/dogs", authenticated, true)).size());

        assertEquals(403, call("POST", "/logout", authenticated, false).statusCode());
        assertEquals(member, session(authenticated).path("user"));
        var logout = call("POST", "/logout", authenticated, true);
        assertEquals(204, logout.statusCode());
        assertTrue(logout.headers().firstValue("set-cookie").orElseThrow().contains("Max-Age=0"));
        assertTrue(session(authenticated).path("user").isNull());

        provider.verify();
        provider.reset();
        var second = start("explore");
        permitSignIn(second, "새 닉네임");
        var again = callback(second, "code=approved");
        assertRedirect("/#explore", again);
        var returning = session(cookie(again));
        assertTrue(returning.path("dogSetupPending").asBoolean());
        var sameMember = returning.path("user");
        assertEquals(member.path("id"), sameMember.path("id"));
        assertEquals("새 닉네임", sameMember.path("nickname").asString());
        assertTrue(session(null).path("user").isNull());

        Path file = dataDir.resolve("members.json");
        String saved = Files.readString(file);
        assertTrue(mapper.readTree(saved).has(Long.toString(KAKAO_USER_ID)));
        assertFalse(saved.contains("provider-token"));
        var reopened = new MemberStore(mapper, file.toString());
        assertEquals(sameMember.path("id").asString(), reopened.signIn(new KakaoLoginClient.User(KAKAO_USER_ID, "새 닉네임")).member().id());
    }

    @Test void onlyAcceptsTheMatchingUnusedAttemptAndHandlesCancellation() throws Exception {
        var attempt = start("community");
        assertRedirect("/?login=expired", call("GET", "/kakao/callback?state=" + attempt.state() + "&code=approved", null, false));
        assertRedirect("/?login=expired", call("GET", "/kakao/callback?state=wrong&code=approved", attempt.cookie(), false));
        assertRedirect("/?login=cancelled#community", callback(attempt, "error=access_denied"));
        assertRedirect("/?login=expired", callback(attempt, "code=approved"));
        assertTrue(session(attempt.cookie()).path("user").isNull());
    }

    @Test void providerErrorsLeaveTheBrowserSignedOut() throws Exception {
        var attempt = start("https://other.example");
        provider.expect(requestTo("https://kauth.kakao.com/oauth/token")).andRespond(withBadRequest());
        assertRedirect("/?login=failed", callback(attempt, "code=declined"));
        assertTrue(session(attempt.cookie()).path("user").isNull());
    }

    @Test void rejectedClientCredentialsHaveADistinctError() throws Exception {
        var attempt = start("community");
        provider.expect(requestTo("https://kauth.kakao.com/oauth/token"))
                .andRespond(withBadRequest().contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"error":"invalid_client","error_code":"KOE010","error_description":"Bad client credentials"}
                                """));
        assertRedirect("/?login=misconfigured#community", callback(attempt, "code=approved"));
        assertTrue(session(attempt.cookie()).path("user").isNull());
    }

    @Test void existingMemberFilesCanStoreDogProfilesWithoutChangingIds() throws Exception {
        var legacyFile = dataDir.resolve("legacy-members.json");
        Files.writeString(legacyFile, mapper.writeValueAsString(Map.of(KAKAO_USER_ID,
                Map.of("id", "existing-member", "nickname", "기존 회원"))));
        var existing = new MemberStore(mapper, legacyFile.toString());
        var user = new KakaoLoginClient.User(KAKAO_USER_ID, "기존 회원");
        var signIn = existing.signIn(user);
        assertTrue(signIn.showDogSetup());
        var member = signIn.member();
        assertEquals("existing-member", member.id());
        assertTrue(existing.dogs(member).isEmpty());
        var dog = existing.saveDog(member, null, new MemberStore.DogInput("구름", 25), false);
        var saved = (tools.jackson.databind.node.ObjectNode) mapper.readTree(Files.readString(legacyFile))
                .path(Long.toString(KAKAO_USER_ID)).path("dogs").get(0);
        var legacyDog = saved.deepCopy().put("size", "MEDIUM").put("age", 4)
                .put("publicProfile", true).put("avoidStairs", true).put("preferShade", true).put("preferQuiet", true);
        var unnamedDog = saved.deepCopy().put("id", "unnamed-dog");
        unnamedDog.remove("name");
        Files.writeString(legacyFile, mapper.writeValueAsString(Map.of(KAKAO_USER_ID,
                Map.of("id", member.id(), "nickname", member.nickname(), "dogs", List.of(legacyDog, unnamedDog)))));
        var reopened = new MemberStore(mapper, legacyFile.toString());
        assertEquals(member, reopened.signIn(user).member());
        assertEquals(new MemberStore.DogProfile(dog.id(), "구름", 25), reopened.dog(member, dog.id()));
        assertEquals(new MemberStore.DogProfile(dog.id(), "하늘", 35),
                reopened.saveDog(member, dog.id(), new MemberStore.DogInput("하늘", 35), false));
        assertNull(reopened.dog(member, "unnamed-dog").name());
        assertEquals(new MemberStore.DogProfile("unnamed-dog", "노을", 25),
                reopened.saveDog(member, "unnamed-dog", new MemberStore.DogInput("노을", 25), false));
        var updated = mapper.readTree(Files.readString(legacyFile)).path(Long.toString(KAKAO_USER_ID)).path("dogs").get(0);
        assertFalse(updated.has("size"));
        assertFalse(updated.has("age"));
        assertFalse(updated.has("publicProfile"));
    }

    @Test void checkedSkipHidesTheReminderAcrossLoginsAndExistingSettingsExpire() throws Exception {
        long userId = KAKAO_USER_ID + 3;
        String first = signIn(userId, "산책 보호자");
        assertTrue(session(first).path("dogSetupPending").asBoolean());

        Instant before = Instant.now();
        assertEquals(204, call("POST", "/dogs/skip-setup?hideSetup=true", first, true).statusCode());
        assertFalse(session(first).path("dogSetupPending").asBoolean());
        assertEquals(204, call("POST", "/logout", first, true).statusCode());
        String returning = signIn(userId, "변경된 보호자");
        assertFalse(session(returning).path("dogSetupPending").asBoolean());

        var file = dataDir.resolve("members.json");
        var stored = (tools.jackson.databind.node.ObjectNode) mapper.readTree(Files.readString(file));
        var account = (tools.jackson.databind.node.ObjectNode) stored.path(Long.toString(userId));
        var hiddenUntil = mapper.treeToValue(account.path("dogSetupHiddenUntil"), Instant.class);
        assertFalse(hiddenUntil.isBefore(before.plus(Duration.ofDays(3))));
        assertFalse(hiddenUntil.isAfter(Instant.now().plus(Duration.ofDays(3))));
        var user = new KakaoLoginClient.User(userId, "변경된 보호자");
        assertFalse(new MemberStore(mapper, file.toString()).signIn(user).showDogSetup());

        account.set("dogSetupHiddenUntil", mapper.valueToTree(before.minusSeconds(1)));
        var expiredFile = dataDir.resolve("expired-reminder.json");
        Files.writeString(expiredFile, mapper.writeValueAsString(stored));
        assertTrue(new MemberStore(mapper, expiredFile.toString()).signIn(user).showDogSetup());
    }

    @Test void savingWithTheCheckboxHidesTheReminderAndManualNavigationSkipsThePrompt() throws Exception {
        long userId = KAKAO_USER_ID + 4;
        String direct = signIn(userId, "직접 등록 보호자", "community/dogs");
        assertFalse(session(direct).path("dogSetupPending").asBoolean());
        assertEquals(204, call("POST", "/logout", direct, true).statusCode());
        String normal = signIn(userId, "직접 등록 보호자");
        assertTrue(session(normal).path("dogSetupPending").asBoolean());
        var input = Map.of("name", "구름", "walkMinutes", 30);
        json(201, send("POST", "/api/auth/dogs?hideSetup=true", normal, input, true));
        assertFalse(session(normal).path("dogSetupPending").asBoolean());
        assertEquals(204, call("POST", "/logout", normal, true).statusCode());
        assertFalse(session(signIn(userId, "직접 등록 보호자")).path("dogSetupPending").asBoolean());
    }

    @Test void dogProfilesEnforceOwnershipAndFilterCoursesUsingTheSavedPreferences() throws Exception {
        long ownerId = KAKAO_USER_ID + 1, neighborId = KAKAO_USER_ID + 2;
        String owner = signIn(ownerId, "보리 보호자");
        String neighbor = signIn(neighborId, "이웃 보호자");
        String dogs = "/api/auth/dogs";
        var input = Map.of("name", "  보리  ", "walkMinutes", 30);
        assertTrue(session(owner).path("dogSetupPending").asBoolean());
        assertEquals(401, send("GET", dogs, null, null, true).statusCode());
        assertEquals(401, send("POST", dogs, null, input, true).statusCode());
        assertEquals(403, send("POST", dogs, owner, input, false).statusCode());
        assertEquals(400, send("POST", dogs, owner, Map.of("name", "보리", "walkMinutes", 0), true).statusCode());
        assertEquals(400, send("POST", dogs, owner, Map.of("name", "  ", "walkMinutes", 30), true).statusCode());
        var dog = json(201, send("POST", dogs, owner, input, true));
        String id = dog.path("id").asString();
        assertFalse(session(owner).path("dogSetupPending").asBoolean());
        assertFalse(dog.has("publicProfile"));
        assertEquals("보리", dog.path("name").asString());
        assertFalse(dog.has("age"));
        assertFalse(dog.has("size"));
        assertEquals(dog, json(200, send("GET", dogs, owner, null, true)).get(0));
        assertEquals(0, json(200, send("GET", dogs, neighbor, null, true)).size());
        assertEquals(404, send("PUT", dogs + "/" + id, neighbor, input, true).statusCode());
        assertEquals(404, send("GET", dogs + "/" + id + "/public", null, null, false).statusCode());

        var profile = send("POST", "/api/community/profile", owner, Map.of("nickname", "산책 코스 작성자"), true);
        assertEquals(200, profile.statusCode());
        String travelerCookie = owner;
        var stops = csv.inRegion("11").stream().map(CsvFacilities.Facility::place)
                .filter(place -> !place.latitude().isBlank() && !place.longitude().isBlank()).limit(2)
                .map(place -> Map.of("id", place.id(), "latitude", place.latitude(), "longitude", place.longitude())).toList();
        var walk = Map.<String, Object>of("minutes", 25, "stairs", false, "shade", true, "quiet", true);
        String courses = "/api/community/courses";
        var body = new HashMap<String, Object>(Map.of("title", "프로필추천 산책", "content", "반려견과 함께 걸어요.", "region", "11", "stops", stops));
        String unknownId = postCourse(travelerCookie, body);
        String matchingCourseId = postCourse(travelerCookie, with(body, "walk", walk));
        String boundaryId = postCourse(travelerCookie, with(body, "walk", with(walk, "minutes", 30)));
        String longerId = postCourse(travelerCookie, with(body, "walk", with(walk, "minutes", 31)));
        var legacyWalk = with(with(walk, "minutes", 22), "sizes", List.of("LARGE"));
        String legacyId = postCourse(travelerCookie, with(body, "walk", legacyWalk));
        var legacyCourse = json(200, send("GET", courses + "/" + legacyId, null, null, false)).path("course");
        assertFalse(legacyCourse.path("walk").has("sizes"));
        postCourse(travelerCookie, with(with(body, "walk", walk), "region", "26"));
        postCourse(travelerCookie, with(with(body, "walk", with(walk, "minutes", 20)), "title", "다른 검색어"));

        String filtered = courses + "?dog=" + id;
        var plain = json(200, send("GET", courses, null, null, false));
        assertEquals(7, plain.path("total").asInt());
        assertFalse(plain.path("items").get(0).has("recommendation"));
        assertEquals(401, send("GET", filtered, null, null, false).statusCode());
        assertEquals(404, send("GET", filtered, neighbor, null, false).statusCode());
        filtered += "&region=11&keyword=" + java.net.URLEncoder.encode("프로필추천", StandardCharsets.UTF_8);
        var matches = json(200, send("GET", filtered, owner, null, false));
        assertEquals(List.of(legacyId, matchingCourseId, boundaryId), courseIds(matches));
        assertTrue(matches.path("items").get(0).path("mine").asBoolean());
        assertEquals(courseIds(matches), courseIds(json(200, send("GET", filtered + "&mine=true", owner, null, false))));
        var boundary = matches.path("items").get(2);
        var assessment = boundary.path("recommendation");
        assertEquals("WITHIN_LIMIT", assessment.path("time").asString());
        assertFalse(assessment.has("size"));
        assertEquals(30, assessment.path("minutes").asInt());
        assertEquals(30, assessment.path("maxMinutes").asInt());
        var detail = json(200, send("GET", courses + "/" + boundaryId, null, null, false));
        assertEquals(boundary.path("course"), detail.path("course"));
        assertEquals(stops.getFirst().get("id"), detail.path("course").path("stops").get(0).path("id").asString());
        assertFalse(detail.has("recommendation"));
        assertEquals(List.of(legacyId, matchingCourseId), courseIds(json(200, send("GET", filtered + "&maxWalkMinutes=25", owner, null, false))));
        assertEquals(List.of(legacyId, matchingCourseId, boundaryId, longerId),
                courseIds(json(200, send("GET", filtered + "&maxWalkMinutes=31", owner, null, false))));
        assertEquals(List.of(boundaryId, longerId, matchingCourseId, legacyId),
                courseIds(json(200, send("GET", filtered + "&maxWalkMinutes=31&walkOrder=CLOSEST_TO_PREFERENCE", owner, null, false))));
        assertEquals(400, send("GET", filtered + "&maxWalkMinutes=0", owner, null, false).statusCode());
        var missing = json(200, send("GET", filtered + "&timeUnknown=true", owner, null, false));
        assertEquals(List.of(unknownId), courseIds(missing));
        assertEquals("UNKNOWN", missing.path("items").get(0).path("recommendation").path("time").asString());
        var shorterProfile = json(201, send("POST", dogs, owner, Map.of("name", "두부", "walkMinutes", 24), true));
        String shorterFeed = filtered.replace("dog=" + id, "dog=" + shorterProfile.path("id").asString());
        assertEquals(List.of(legacyId), courseIds(json(200, send("GET", shorterFeed, owner, null, false))));

        var editedWalk = with(walk, "minutes", 28);
        body.put("walk", editedWalk);
        var editedCourse = json(200, send("PUT", courses + "/" + matchingCourseId, travelerCookie, body, true)).path("course");
        assertEquals(28, editedCourse.path("walk").path("minutes").asInt());
        assertEquals(3, json(200, send("GET", filtered, owner, null, false)).path("total").asInt());

        var updatedInput = Map.of("name", "보리별", "walkMinutes", 20);
        String visibility = dogs + "/" + id + "/visibility";
        assertEquals(404, send("PUT", visibility, neighbor, Map.of("publicProfile", true), true).statusCode());
        var updated = json(200, send("PUT", dogs + "/" + id, owner, updatedInput, true));
        assertEquals(id, updated.path("id").asString());
        assertEquals("보리별", updated.path("name").asString());
        assertEquals(20, updated.path("walkMinutes").asInt());
        assertFalse(updated.has("publicProfile"));
        assertEquals(0, json(200, send("GET", filtered, owner, null, false)).path("total").asInt());
        assertEquals(404, send("GET", dogs + "/" + id + "/public", neighbor, null, false).statusCode());

        assertEquals(204, call("POST", "/logout", owner, true).statusCode());
        assertEquals(401, send("GET", dogs, owner, null, true).statusCode());
        String signedBackIn = signIn(ownerId, "새 보호자 닉네임");
        assertTrue(session(signedBackIn).path("dogSetupPending").asBoolean());
        assertEquals(updated, json(200, send("GET", dogs, signedBackIn, null, true)).values().stream()
                .filter(item -> id.equals(item.path("id").asString())).findFirst().orElseThrow());
        var reopened = new MemberStore(mapper, dataDir.resolve("members.json").toString());
        var savedMember = reopened.signIn(new KakaoLoginClient.User(ownerId, "새 보호자 닉네임")).member();
        assertEquals(updated, mapper.valueToTree(reopened.dog(savedMember, id)));
    }

    @Test void dogDeletionRequiresOwnerAndRemovedPublicRoutesStayUnavailable() throws Exception {
        String owner = signIn(801212L,"삭제테스트소유자");
        String neighbor = signIn(801213L,"다른삭제소유자");
        String path = "/api/auth/dogs";
        var dog = json(201,send("POST",path,owner,Map.of("name","보리","walkMinutes",20),true));
        String id = dog.path("id").asString();
        var second = json(201,send("POST",path,owner,Map.of("name","두부","walkMinutes",30),true));
        assertEquals(401,send("DELETE",path+"/"+id,null,null,true).statusCode());
        assertEquals(403,send("DELETE",path+"/"+id,owner,null,false).statusCode());
        assertEquals(404,send("DELETE",path+"/"+id,neighbor,null,true).statusCode());
        assertEquals(404,send("GET",path+"/"+id+"/public",owner,null,false).statusCode());
        assertEquals(404,send("PUT",path+"/"+id+"/visibility",owner,Map.of("publicProfile",true),true).statusCode());
        assertEquals(204,send("DELETE",path+"/"+id,owner,null,true).statusCode());
        var remaining = json(200,send("GET",path,owner,null,false));
        assertEquals(1,remaining.size()); assertEquals(second.path("id"),remaining.get(0).path("id"));
        assertEquals(404,send("DELETE",path+"/"+id,owner,null,true).statusCode());
        assertEquals(204,send("DELETE",path+"/"+second.path("id").asString(),owner,null,true).statusCode());
        assertEquals(0,json(200,send("GET",path,owner,null,false)).size());
        var reopened = new MemberStore(mapper,dataDir.resolve("members.json").toString());
        assertTrue(reopened.dogs(reopened.signIn(new KakaoLoginClient.User(801212L,"삭제테스트소유자")).member()).isEmpty());
    }

    private String postCourse(String cookie, Map<String, Object> body) throws Exception {
        return json(201, send("POST", "/api/community/courses", cookie, body, true)).path("course").path("id").asString();
    }

    private static List<String> courseIds(JsonNode feed) {
        return feed.path("items").values().stream().map(item -> item.path("course").path("id").asString()).toList();
    }

    private static Map<String, Object> with(Map<String, Object> source, String key, Object value) {
        var updated = new HashMap<>(source);
        updated.put(key, value);
        return updated;
    }

    private String signIn(long providerId, String nickname) throws Exception {
        return signIn(providerId, nickname, "community");
    }

    private String signIn(long providerId, String nickname, String section) throws Exception {
        provider.verify();
        provider.reset();
        var attempt = start(section);
        permitSignIn(attempt, providerId, nickname);
        var result = callback(attempt, "code=approved");
        assertRedirect("/#" + section, result);
        return cookie(result);
    }

    private Attempt start(String section) throws Exception {
        var response = call("GET", "/kakao?section=" + section, null, false);
        assertEquals(303, response.statusCode());
        var location = URI.create(response.headers().firstValue("location").orElseThrow());
        assertEquals("kauth.kakao.com", location.getHost());
        assertEquals("/oauth/authorize", location.getPath());
        var query = UriComponentsBuilder.fromUriString(location.toString()).build().getQueryParams();
        assertEquals("code", query.getFirst("response_type"));
        assertEquals("S256", query.getFirst("code_challenge_method"));
        assertFalse(location.toString().contains("test-secret"));
        return new Attempt(cookie(response), query.getFirst("state"), query.getFirst("code_challenge"));
    }

    @Test void loginReturnsToPointShop() throws Exception {
        var attempt = start("shop");
        permitSignIn(attempt, "포인트 여행자");
        var response = callback(attempt, "code=approved");
        assertRedirect("/#shop", response);
        assertNotNull(session(cookie(response)).path("user").path("id").asString(null));
    }

    private void permitSignIn(Attempt attempt, String nickname) {
        permitSignIn(attempt, KAKAO_USER_ID, nickname);
    }

    private void permitSignIn(Attempt attempt, long providerId, String nickname) {
        provider.expect(requestTo("https://kauth.kakao.com/oauth/token"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().formDataContains(Map.of("grant_type", "authorization_code", "client_id", "test-key",
                        "client_secret", "test-secret", "redirect_uri", REDIRECT, "code", "approved")))
                .andExpect(request -> {
                    String data = new String(((MockClientHttpRequest) request).getBodyAsBytes(), StandardCharsets.UTF_8);
                    String verifier = UriComponentsBuilder.fromPath("/").query(data).build().getQueryParams().getFirst("code_verifier");
                    assertNotNull(verifier);
                    try {
                        byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
                        assertEquals(attempt.challenge(), Base64.getUrlEncoder().withoutPadding().encodeToString(digest));
                    } catch (NoSuchAlgorithmException ex) {
                        throw new AssertionError(ex);
                    }
                })
                .andRespond(withSuccess("{\"access_token\":\"provider-token\"}", MediaType.APPLICATION_JSON));
        provider.expect(requestTo("https://kapi.kakao.com/v2/user/me?property_keys=%5B%22kakao_account.profile%22%5D"))
                .andExpect(header("Authorization", "Bearer provider-token"))
                .andRespond(withSuccess(mapper.writeValueAsString(Map.of("id", providerId,
                        "kakao_account", Map.of("profile", Map.of("nickname", nickname)))), MediaType.APPLICATION_JSON));
    }

    private JsonNode session(String cookie) throws Exception {
        var response = call("GET", "/session", cookie, false);
        assertEquals(200, response.statusCode());
        assertEquals("no-store", response.headers().firstValue("cache-control").orElseThrow());
        return mapper.readTree(response.body());
    }

    private HttpResponse<String> callback(Attempt attempt, String result) throws Exception {
        return call("GET", "/kakao/callback?state=" + attempt.state() + "&" + result, attempt.cookie(), false);
    }

    private HttpResponse<String> call(String method, String suffix, String cookie, boolean sameOrigin) throws Exception {
        return send(method, "/api/auth" + suffix, cookie, null, sameOrigin);
    }

    private HttpResponse<String> send(String method, String path, String cookie, Object body, boolean sameOrigin) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (cookie != null) request.header("Cookie", cookie);
        if (sameOrigin) request.header(path.startsWith("/api/auth") ? "X-Auth-Client" : "X-Community-Client", "web");
        if (body != null) request.header("Content-Type", "application/json");
        var content = body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body));
        return browser.send(request.method(method, content).build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode json(int status, HttpResponse<String> response) {
        assertEquals(status, response.statusCode(), response.body());
        return mapper.readTree(response.body());
    }

    private static void assertRedirect(String location, HttpResponse<String> response) {
        assertEquals(303, response.statusCode());
        assertEquals(location, response.headers().firstValue("location").orElseThrow());
        assertEquals("no-referrer", response.headers().firstValue("referrer-policy").orElseThrow());
    }

    private static String cookie(HttpResponse<String> response) {
        String cookie = response.headers().firstValue("set-cookie").orElseThrow();
        assertTrue(cookie.startsWith("daeng-session="));
        assertTrue(cookie.contains("Path=/api;"));
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("SameSite=Lax"));
        return cookie.split(";", 2)[0];
    }
}
