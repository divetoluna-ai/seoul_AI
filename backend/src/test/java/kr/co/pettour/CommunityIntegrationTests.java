package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import static java.nio.charset.StandardCharsets.UTF_8;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="tour.api-key=")
class CommunityIntegrationTests {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired CombinedPlaceService catalog;
    @Autowired CsvFacilities csv;
    @Autowired AuthSessionStore sessions;
    @Autowired MemberStore members;
    @Autowired CommunityService community;
    static final Path store;
    static { try { store = Files.createTempDirectory("pet-tour-course-test-").resolve("courses.json"); } catch (Exception ex) { throw new ExceptionInInitializerError(ex); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) { registry.add("community.store", store::toString); registry.add("auth.members-file", () -> store.resolveSibling("members.json").toString()); registry.add("auth.sessions-file", () -> store.resolveSibling("sessions.json").toString()); }
    private final HttpClient client = HttpClient.newHttpClient();
    record Actor(String cookie, String nickname) {}
    HttpResponse<String> call(String method, String path, Object body, String cookie, boolean header) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/community" + path));
        if (cookie != null) builder.header("Cookie", cookie);
        if (header) builder.header("X-Community-Client", "web");
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> call(Actor actor, String method, String path, Object body) throws Exception { return call(method, path, body, actor == null ? null : actor.cookie, true); }
    JsonNode ok(Actor actor, String method, String path, Object body) throws Exception {
        var res = call(actor, method, path, body); assertTrue(res.statusCode() >= 200 && res.statusCode() < 300, res.statusCode() + ": " + res.body());
        return res.statusCode() == 204 ? mapper.nullNode() : mapper.readTree(res.body());
    }
    Actor actor() throws Exception {
        String nick = "여행자" + UUID.randomUUID().toString().substring(0, 8);
        var member = members.signIn(new KakaoLoginClient.User(UUID.randomUUID().getMostSignificantBits() & Long.MAX_VALUE, nick));
        String cookie = "daeng-session=" + sessions.signIn(member.member().id());
        var res = call("POST", "/profile", Map.of("nickname", nick, "petName", "보리"), cookie, true);
        assertEquals(200, res.statusCode(), res.body());
        assertTrue(res.headers().allValues("set-cookie").isEmpty());
        assertFalse(res.body().contains("token")); return new Actor(cookie, nick);
    }
    String memberKey(Actor actor) { return "member:" + sessions.memberId(actor.cookie.substring(actor.cookie.indexOf('=') + 1)); }
    List<Place> places() {
        return csv.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> !p.latitude().isBlank() && !p.longitude().isBlank()).limit(3).toList();
    }
    Map<String, String> stop(Place p) { return Map.of("id", p.id(), "latitude", p.latitude(), "longitude", p.longitude()); }
    Map<String, Object> course(String title) {
        var places = places();
        return new HashMap<>(Map.of("title", title, "content", "반려견과 함께 식사하고 느긋하게 산책하는 추천 코스입니다.", "region", "11", "stops", List.of(stop(places.get(0)), stop(places.get(1)))));
    }
    @Test void sharesOrderedCoursesWithOwnershipLikesEditingAndPersistentSnapshots() throws Exception {
        var owner = actor(); var neighbor = actor(); var body = course("함께 떠나는 코스" + owner.nickname);
        assertEquals(401, call(null, "POST", "/courses", body).statusCode());
        assertEquals(403, call("POST", "/courses", body, owner.cookie, false).statusCode());
        var created = call(owner, "POST", "/courses", body); assertEquals(201, created.statusCode(), created.body());
        String id = mapper.readTree(created.body()).path("course").path("id").asText();
        var detail = ok(null, "GET", "/courses/" + id, null);
        assertEquals(owner.nickname, detail.path("author").path("nickname").asText());
        assertEquals(places().get(0).id(), detail.path("course").path("stops").get(0).path("id").asText());
        assertEquals(places().get(1).name(), detail.path("course").path("stops").get(1).path("name").asText());
        assertFalse(detail.toString().contains("tokenHash")); assertFalse(detail.path("course").has("likes")); assertFalse(detail.path("course").has("authorId"));
        assertEquals(403, call(neighbor, "DELETE", "/courses/" + id, null).statusCode());
        assertEquals(403, call(neighbor, "PUT", "/courses/" + id, body).statusCode());
        assertEquals(1, ok(neighbor, "PUT", "/courses/" + id + "/like", Map.of("enabled", true)).path("likeCount").asInt());
        assertEquals(1, ok(neighbor, "PUT", "/courses/" + id + "/like", Map.of("enabled", true)).path("likeCount").asInt());
        body.put("stops", List.of(stop(places().get(1)), stop(places().get(0)))); body.put("title", "순서를 바꾼 여행 코스");
        var updated = ok(owner, "PUT", "/courses/" + id, body);
        assertEquals(places().get(1).id(), updated.path("course").path("stops").get(0).path("id").asText());
        assertEquals(1, updated.path("likeCount").asInt());
        var reloaded = new CommunityService(mapper, catalog, store.toString());
        assertEquals(1, reloaded.detail(null, id).likeCount()); assertEquals(places().get(1).id(), reloaded.detail(null, id).course().stops().getFirst().id());
        String token = memberKey(owner);
        assertNotNull(reloaded.me(token)); assertFalse(Files.readString(store).contains(token));
        ok(owner, "DELETE", "/courses/" + id, null); assertEquals(404, call(null, "GET", "/courses/" + id, null).statusCode());
    }
    @Test void validatesCourseLengthDuplicatesCoordinatesAndCatalogIdentity() throws Exception {
        var actor = actor(); var body = course("잘못된 코스 검증");
        body.put("stops", List.of(stop(places().get(0)))); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        body.put("stops", Collections.nCopies(9, stop(places().get(0)))); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        body.put("stops", List.of(stop(places().get(0)), stop(places().get(0)))); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        for (var bad : List.of(Map.of("id", "demo-1", "latitude", "37.5", "longitude", "127"), Map.of("id", places().get(1).id(), "latitude", "0", "longitude", "0"), Map.of("id", places().get(1).id(), "latitude", "35.1", "longitude", "129.1"), Map.of("id", "csv-00000000000000000000", "latitude", "37.5", "longitude", "127"))) {
            body.put("stops", List.of(stop(places().get(0)), bad)); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        }
        body = course("입력값 확인"); body.put("region", "999"); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        body = course("입력값 확인"); body.put("content", ""); assertEquals(400, call(actor, "POST", "/courses", body).statusCode());
        var registry = csv.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> p.latitude().isBlank()).findFirst().orElseThrow();
        body = course("주소로 위치를 확인한 코스"); body.put("stops", List.of(stop(places().get(0)), Map.of("id", registry.id(), "latitude", "37.5665", "longitude", "126.978")));
        var created = ok(actor, "POST", "/courses", body).path("course").path("stops").get(1);
        assertEquals(registry.name(), created.path("name").asText()); assertEquals(registry.address(), created.path("address").asText());
        assertEquals("37.5665", created.path("latitude").asText());
    }
    @Test void feedFiltersPaginationPopularityAndMyCoursesUseTheSameSharedStore() throws Exception {
        var owner = actor(); var neighbor = actor(); String keyword = "코스묶음" + UUID.randomUUID().toString().substring(0, 8);
        var ids = new ArrayList<String>();
        for (int i=0; i<13; i++) ids.add(ok(owner, "POST", "/courses", course(keyword + " " + i)).path("course").path("id").asText());
        String query = "?keyword=" + URLEncoder.encode(keyword, UTF_8);
        var first = ok(null, "GET", "/courses" + query, null); var second = ok(null, "GET", "/courses" + query + "&page=2", null);
        assertEquals(13, first.path("total").asInt()); assertEquals(12, first.path("items").size()); assertEquals(1, second.path("items").size());
        assertEquals(0, ok(null, "GET", "/courses" + query + "&region=26", null).path("total").asInt());
        assertEquals(13, ok(owner, "GET", "/courses" + query + "&mine=true", null).path("total").asInt());
        assertEquals(0, ok(neighbor, "GET", "/courses" + query + "&mine=true", null).path("total").asInt());
        assertEquals(401, call(null, "GET", "/courses?mine=true", null).statusCode());
        ok(neighbor, "PUT", "/courses/" + ids.getFirst() + "/like", Map.of("enabled", true));
        assertEquals(ids.getFirst(), ok(null, "GET", "/courses" + query + "&sort=popular", null).path("items").get(0).path("course").path("id").asText());
        assertEquals(400, call(null, "GET", "/courses?page=0", null).statusCode());
        assertEquals(400, call(null, "GET", "/courses?sort=wrong", null).statusCode());
        assertEquals(409, call(neighbor, "POST", "/profile", Map.of("nickname", owner.nickname, "petName", "")).statusCode());
    }
    @Test void legacyProfileCookiesAndRevokedLoginsCannotEarnPoints() throws Exception {
        String legacy = "legacy-" + UUID.randomUUID();
        community.saveProfile(legacy, new CommunityService.ProfileInput("이전" + UUID.randomUUID().toString().substring(0,8), "보리"));
        String legacyCookie = "daeng-community=" + legacy;
        var owner = actor(); var liker = actor();
        String courseId = ok(owner, "POST", "/courses", course("로그인 적립 보호")).path("course").path("id").asText();
        for (String cookie : List.of(legacyCookie, "daeng-session=invalid; " + legacyCookie)) {
            assertEquals(401, call("POST", "/courses", course("비로그인 공유 차단"), cookie, true).statusCode());
            assertEquals(401, call("POST", "/shares", Map.of("stops", List.of()), cookie, true).statusCode());
            assertEquals(401, call("PUT", "/shares/any/complete", null, cookie, true).statusCode());
            assertEquals(401, call("PUT", "/courses/" + courseId + "/like", Map.of("enabled",true), cookie, true).statusCode());
            assertEquals(401, call("POST", "/nfc/heartbeat", null, cookie, true).statusCode());
            assertTrue(mapper.readTree(call("GET", "/profile", null, cookie, true).body()).path("profile").isNull());
        }
        ok(liker, "PUT", "/courses/" + courseId + "/like", Map.of("enabled",true));
        String token = liker.cookie.substring(liker.cookie.indexOf('=') + 1);
        var relogin = new Actor("daeng-session=" + sessions.signIn(sessions.memberId(token)), liker.nickname);
        sessions.revoke(token);
        assertEquals(401, call(liker,"PUT","/courses/" + courseId + "/like",Map.of("enabled",false)).statusCode());
        assertEquals(1, ok(relogin,"GET","/points",null).path("total").asInt());
        ok(relogin,"PUT","/courses/" + courseId + "/like",Map.of("enabled",true));
        assertEquals(1, ok(relogin,"GET","/points",null).path("total").asInt());
        assertEquals(0, community.points(legacy).total());
    }
    @Test void browserCookieScopeSupportsCommunityAndLogoutRevokesIt() throws Exception {
        var actor = actor();
        var cookies = new java.net.CookieManager(null, java.net.CookiePolicy.ACCEPT_ALL);
        var browser = HttpClient.newBuilder().cookieHandler(cookies).build();
        String base = "http://localhost:" + port;
        var session = browser.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/session")).header("Cookie", actor.cookie).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, session.statusCode());
        assertTrue(cookies.getCookieStore().getCookies().stream().anyMatch(c -> c.getName().equals("daeng-session") && c.getPath().equals("/api") && c.isHttpOnly()));
        var points = browser.send(HttpRequest.newBuilder(URI.create(base + "/api/community/points")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, points.statusCode());
        var logout = browser.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/logout")).header("X-Auth-Client", "web").POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(204, logout.statusCode());
        assertTrue(logout.headers().allValues("Set-Cookie").stream().anyMatch(c -> c.contains("Path=/api/auth") && c.contains("Max-Age=0")));
        assertEquals(401, browser.send(HttpRequest.newBuilder(URI.create(base + "/api/community/points")).GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode());
    }
    @Test void formerBoardsMeetingsMarketAndChatRoutesAreRemoved() throws Exception {
        var owner = actor(); String id = UUID.randomUUID().toString();
        for (String path : List.of("/posts", "/conversations", "/posts/" + id)) assertEquals(404, call(null, "GET", path, null).statusCode());
        for (String path : List.of("/posts", "/conversations", "/posts/"+id+"/comments")) assertEquals(404, call(owner, "POST", path, Map.of()).statusCode());
        assertEquals(404, call(owner, "PUT", "/posts/"+id+"/join", Map.of("enabled", true)).statusCode());
    }
    @Test void failedWritesRollBackAndLegacyFilesRemainUntouched() throws Exception {
        Path blocked = Files.createTempFile("course-blocked-", ".tmp");
        var broken = new CommunityService(mapper, catalog, blocked.resolve("courses.json").toString());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> broken.saveProfile("token", new CommunityService.ProfileInput("테스트여행자", "")));
        assertNull(broken.me("token"));
        Path folder = Files.createTempDirectory("legacy-community-"); Path legacy = folder.resolve("community.json");
        String old = "{\"accounts\":[],\"posts\":[{\"content\":\"old board\"}],\"messages\":[{\"content\":\"private message\"}]}";
        Files.writeString(legacy, old);
        var isolated = new CommunityService(mapper, catalog, legacy.toString()); isolated.saveProfile("new-token", new CommunityService.ProfileInput("새여행자", ""));
        assertEquals(old, Files.readString(legacy)); assertTrue(Files.exists(folder.resolve("course-community.json")));
        assertEquals(0, isolated.feed(null, "", "", "recent", 1, false, null, false).total());
        Path corrupt = folder.resolve("broken.json"); Files.writeString(corrupt, "{broken");
        assertThrows(Exception.class, () -> new CommunityService(mapper, catalog, corrupt.toString())); assertEquals("{broken", Files.readString(corrupt));
    }
    @Test void nfcSimulationEndpointsRequireSessionAndPersistToggle() throws Exception {
        var actor = actor();
        assertEquals(401, call(null, "PUT", "/nfc/proximity", Map.of("enabled", true)).statusCode());
        assertEquals(401, call(null, "POST", "/nfc/heartbeat", null).statusCode());
        assertEquals(403, call("PUT", "/nfc/proximity", Map.of("enabled", true), actor.cookie, false).statusCode());
        var started = ok(actor, "PUT", "/nfc/proximity", Map.of("enabled", true));
        assertTrue(started.path("nfc").path("active").asBoolean());
        assertEquals("보리", started.path("nfc").path("petName").asText());
        assertTrue(ok(actor, "POST", "/nfc/heartbeat", null).path("nfc").path("active").asBoolean());
        assertFalse(ok(actor, "PUT", "/nfc/proximity", Map.of("enabled", false)).path("nfc").path("active").asBoolean());
        assertFalse(ok(actor, "GET", "/points", null).path("nfc").path("active").asBoolean());
    }
    @Test void sharesRewardOnlyTheirOwnerOnceAndArePubliclyReadable() throws Exception {
        var owner = actor(); var stranger = actor();
        var stop = Map.of("id", "csv-test-place", "name", "공원", "address", "서울", "category", "attraction", "latitude", "37.56", "longitude", "126.97");
        var body = Map.of("stops", List.of(stop));
        assertEquals(401, call(null, "POST", "/shares", body).statusCode());
        assertEquals(400, call(owner, "POST", "/shares", Map.of("stops", List.of())).statusCode());
        var invalid = new HashMap<>(stop); invalid.put("latitude", "NaN");
        assertEquals(400, call(owner, "POST", "/shares", Map.of("stops", List.of(invalid))).statusCode());
        String id = ok(owner, "POST", "/shares", body).path("id").asText();
        assertEquals(0, ok(owner, "GET", "/points", null).path("total").asLong(), "Preparing a link is not a completed share");
        var shared = ok(null, "GET", "/shares/" + id, null);
        assertEquals("공원", shared.path("stops").get(0).path("name").asText());
        assertFalse(shared.has("ownerId")); assertFalse(shared.has("fingerprint"));
        assertEquals(401, call(null, "PUT", "/shares/" + id + "/complete", null).statusCode());
        assertEquals(403, call(stranger, "PUT", "/shares/" + id + "/complete", null).statusCode());
        assertEquals(10, ok(owner, "PUT", "/shares/" + id + "/complete", null).path("awarded").asInt());
        assertEquals(0, ok(owner, "PUT", "/shares/" + id + "/complete", null).path("awarded").asInt());
        var renamed = new HashMap<>(stop); renamed.put("name", "이름 변경");
        assertEquals(id, ok(owner, "POST", "/shares", Map.of("stops", List.of(renamed))).path("id").asText());
        assertEquals(10, ok(owner, "GET", "/points", null).path("total").asLong());
        var reloaded = new CommunityService(mapper, catalog, store.toString());
        String token = memberKey(owner);
        assertEquals(10, reloaded.points(token).total()); assertEquals(0, reloaded.completeShare(token, id).awarded());
    }
    @Test void courseLikesAwardOncePerUserAndPersistAcrossProfileEdits() throws Exception {
        var owner = actor(); var neighbor = actor();
        String id = ok(owner, "POST", "/courses", course("코스 좋아요 포인트")).path("course").path("id").asText();
        assertEquals(401, call(null, "GET", "/points", null).statusCode());
        assertEquals(401, call(null, "PUT", "/courses/" + id + "/like", Map.of("enabled", true)).statusCode());
        for (boolean enabled : List.of(true, true, false, true))
            ok(neighbor, "PUT", "/courses/" + id + "/like", Map.of("enabled", enabled));
        assertEquals(1, ok(neighbor, "GET", "/points", null).path("total").asLong());
        assertEquals(0, ok(owner, "GET", "/points", null).path("total").asLong());
        ok(neighbor, "POST", "/profile", Map.of("nickname", neighbor.nickname, "petName", "수정"));
        var reloaded = new CommunityService(mapper, catalog, store.toString());
        assertEquals(1, reloaded.points(memberKey(neighbor)).total());
    }
    @Test void preRewardCourseSnapshotsLoadAndFailedActionsRollBackTheirPoints() throws Exception {
        Path file = Files.createTempDirectory("course-rewards-").resolve("courses.json");
        var original = new CommunityService(mapper, catalog, file.toString());
        var profile = original.saveProfile("old-token", new CommunityService.ProfileInput("기존여행자", "보리"));
        var inputs = places().stream().limit(2).map(p -> new CommunityService.StopInput(p.id(), p.latitude(), p.longitude())).toList();
        String id = original.create("old-token", new CommunityService.CourseInput("기존 여행 코스", "재시작 후에도 보존하는 코스입니다.", "11", inputs, null)).course().id();
        var old = mapper.readValue(Files.readString(file), CommunityService.Snapshot.class);
        Files.writeString(file, mapper.writeValueAsString(Map.of("accounts", old.accounts(), "courses", old.courses())));
        var service = new CommunityService(mapper, catalog, file.toString());
        assertEquals(profile, service.me("old-token")); assertEquals(0, service.points("old-token").total());
        assertEquals(2, service.detail(null, id).course().stops().size());
        String share = service.createShare("old-token", new CommunityService.ShareInput(List.of(
            new CommunityService.SharedPlace("test-place", "공원", "서울", "attraction", "37.56", "126.97")))).id();
        Files.delete(file); Files.createDirectory(file); Files.writeString(file.resolve("blocker"), "block replacement");
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.like("old-token", id, true));
        assertEquals(0, service.points("old-token").total()); assertEquals(0, service.detail("old-token", id).likeCount());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.completeShare("old-token", share));
        assertEquals(0, service.points("old-token").total());
    }
}
