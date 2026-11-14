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
        var dog = existing.saveDog(member, null,
                new MemberStore.DogInput("구름", MemberStore.DogSize.MEDIUM, null, 25), false);
        var saved = (tools.jackson.databind.node.ObjectNode) mapper.readTree(Files.readString(legacyFile))
                .path(Long.toString(KAKAO_USER_ID)).path("dogs").get(0);
        var legacyDog = saved.deepCopy().put("avoidStairs", true).put("preferShade", true).put("preferQuiet", true);
        Files.writeString(legacyFile, mapper.writeValueAsString(Map.of(KAKAO_USER_ID,
                Map.of("id", member.id(), "nickname", member.nickname(), "dogs", List.of(legacyDog)))));
        var reopened = new MemberStore(mapper, legacyFile.toString());
        assertEquals(member, reopened.signIn(user).member());
        assertEquals(List.of(dog), reopened.dogs(member));
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
        var input = Map.of("name", "구름", "size", "MEDIUM", "walkMinutes", 30);
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
        var input = new HashMap<String, Object>(Map.of("name", "보리", "size", "SMALL", "age", 4, "walkMinutes", 30));
        assertTrue(session(owner).path("dogSetupPending").asBoolean());
        assertEquals(401, send("GET", dogs, null, null, true).statusCode());
        assertEquals(401, send("POST", dogs, null, input, true).statusCode());
        assertEquals(403, send("POST", dogs, owner, input, false).statusCode());
        var dog = json(201, send("POST", dogs, owner, input, true));
        String id = dog.path("id").asString();
        assertFalse(session(owner).path("dogSetupPending").asBoolean());
        assertFalse(dog.path("publicProfile").asBoolean());
        assertEquals(dog, json(200, send("GET", dogs, owner, null, true)).get(0));
        assertEquals(0, json(200, send("GET", dogs, neighbor, null, true)).size());
        assertEquals(404, send("PUT", dogs + "/" + id, neighbor, input, true).statusCode());
        assertEquals(404, send("GET", dogs + "/" + id + "/public", null, null, false).statusCode());

        var profile = send("POST", "/api/community/profile", null, Map.of("nickname", "산책 코스 작성자"), true);
        assertEquals(200, profile.statusCode());
        String travelerCookie = profile.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        var stops = csv.inRegion("11").stream().map(CsvFacilities.Facility::place)
                .filter(place -> !place.latitude().isBlank() && !place.longitude().isBlank()).limit(2)
                .map(place -> Map.of("id", place.id(), "latitude", place.latitude(), "longitude", place.longitude())).toList();
        var walk = Map.<String, Object>of("minutes", 25, "sizes", List.of("SMALL"), "stairs", false, "shade", true, "quiet", true);
        var cases = List.of(walk, with(walk, "minutes", 31), with(walk, "sizes", List.of("LARGE")));
        String courses = "/api/community/courses";
        var body = new HashMap<String, Object>(Map.of("title", "프로필추천 산책", "content", "반려견과 함께 걸어요.", "region", "11", "stops", stops));
        json(201, send("POST", courses, travelerCookie, body, true)); // A course without walk conditions.
        String matchingCourseId = "";
        for (var conditions : cases) {
            body.put("walk", conditions);
            var course = json(201, send("POST", courses, travelerCookie, body, true)).path("course");
            if (conditions == walk) matchingCourseId = course.path("id").asString();
        }
        String filtered = courses + "?dog=" + id;
        assertEquals(4, json(200, send("GET", courses, null, null, false)).path("total").asInt());
        assertEquals(401, send("GET", filtered, null, null, false).statusCode());
        assertEquals(404, send("GET", filtered, neighbor, null, false).statusCode());
        var matches = json(200, send("GET", filtered, owner, null, false));
        assertEquals(1, matches.path("total").asInt());
        assertEquals(matchingCourseId, matches.path("items").get(0).path("course").path("id").asString());
        var editedWalk = with(walk, "minutes", 28);
        body.put("walk", editedWalk);
        var editedCourse = json(200, send("PUT", courses + "/" + matchingCourseId, travelerCookie, body, true)).path("course");
        assertEquals(28, editedCourse.path("walk").path("minutes").asInt());
        assertEquals(1, json(200, send("GET", filtered, owner, null, false)).path("total").asInt());

        input.put("name", "보리 수정");
        input.remove("age");
        input.put("walkMinutes", 20);
        String visibility = dogs + "/" + id + "/visibility";
        assertEquals(404, send("PUT", visibility, neighbor, Map.of("publicProfile", true), true).statusCode());
        json(200, send("PUT", visibility, owner, Map.of("publicProfile", true), true));
        var updated = json(200, send("PUT", dogs + "/" + id, owner, input, true));
        assertTrue(updated.path("age").isNull());
        assertTrue(updated.path("publicProfile").asBoolean());
        assertEquals(0, json(200, send("GET", filtered, owner, null, false)).path("total").asInt());
        var publicDog = json(200, send("GET", dogs + "/" + id + "/public", null, null, false));
        assertEquals(mapper.valueToTree(Map.of("name", "보리 수정", "size", "SMALL")), publicDog);
        assertEquals(404, send("PUT", dogs + "/" + id, neighbor, input, true).statusCode());
        var privateDog = json(200, send("PUT", visibility, owner, Map.of("publicProfile", false), true));
        assertEquals(404, send("GET", dogs + "/" + id + "/public", neighbor, null, false).statusCode());

        assertEquals(204, call("POST", "/logout", owner, true).statusCode());
        assertEquals(401, send("GET", dogs, owner, null, true).statusCode());
        String signedBackIn = signIn(ownerId, "새 보호자 닉네임");
        assertTrue(session(signedBackIn).path("dogSetupPending").asBoolean());
        assertEquals(privateDog, json(200, send("GET", dogs, signedBackIn, null, true)).get(0));
        var reopened = new MemberStore(mapper, dataDir.resolve("members.json").toString());
        var savedMember = reopened.signIn(new KakaoLoginClient.User(ownerId, "새 보호자 닉네임")).member();
        assertEquals(privateDog, mapper.valueToTree(reopened.dog(savedMember, id)));
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
