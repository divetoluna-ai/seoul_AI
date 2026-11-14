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
import java.net.http.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="tour.api-key=")
class CommunityIntegrationTests {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired CombinedPlaceService catalog;
    static final Path store;
    static { try { store = Files.createTempDirectory("pet-tour-community-test-").resolve("community.json"); } catch (Exception ex) { throw new ExceptionInInitializerError(ex); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) { registry.add("community.store", store::toString); }
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
        return mapper.readTree(res.body());
    }
    Actor actor() throws Exception {
        String nick = "이웃" + UUID.randomUUID().toString().substring(0, 8);
        var res = call(null, "POST", "/profile", Map.of("nickname", nick, "petName", "보리", "region", "11", "district", "강남구"));
        assertEquals(200, res.statusCode(), res.body());
        String cookie = res.headers().firstValue("set-cookie").orElseThrow(); assertTrue(cookie.contains("HttpOnly")); assertTrue(cookie.contains("SameSite=Strict"));
        assertFalse(res.body().contains("token")); return new Actor(cookie.split(";", 2)[0], nick);
    }
    Map<String, Object> post(String category, String title) {
        return new HashMap<>(Map.of("category", category, "title", title, "content", "이웃과 함께 나누는 유용한 이야기입니다.", "region", "11", "district", "강남구"));
    }
    @Test void sharedPostsOwnershipCommentsLikesAndPersistence() throws Exception {
        var owner = actor(); var neighbor = actor(); var body = post("info", "공유되는 산책 정보");
        assertEquals(401, call(null, "POST", "/posts", body).statusCode());
        assertEquals(403, call("POST", "/posts", body, owner.cookie, false).statusCode());
        String id = ok(owner, "POST", "/posts", body).path("item").path("post").path("id").asText();
        assertEquals(owner.nickname, ok(null, "GET", "/posts/" + id, null).path("item").path("author").path("nickname").asText());
        assertEquals(403, call(neighbor, "DELETE", "/posts/" + id, null).statusCode());
        var comment = ok(neighbor, "POST", "/posts/" + id + "/comments", Map.of("content", "감사해요!"));
        String commentId = comment.path("comments").get(0).path("comment").path("id").asText();
        assertEquals(403, call(owner, "DELETE", "/posts/" + id + "/comments/" + commentId, null).statusCode());
        ok(neighbor, "PUT", "/posts/" + id + "/like", Map.of("enabled", true));
        assertEquals(1, ok(neighbor, "PUT", "/posts/" + id + "/like", Map.of("enabled", true)).path("item").path("likeCount").asInt());
        var filtered = ok(null, "GET", "/posts?region=11&district=" + java.net.URLEncoder.encode("강남구", java.nio.charset.StandardCharsets.UTF_8) + "&keyword=" + java.net.URLEncoder.encode("공유되는 산책 정보", java.nio.charset.StandardCharsets.UTF_8), null);
        assertEquals(1, filtered.path("total").asInt());
        assertEquals(0, ok(null, "GET", "/posts?region=26", null).path("items").size());
        var reloaded = new CommunityService(mapper, catalog, store.toString());
        assertEquals(1, reloaded.detail(null, id).item().likeCount()); assertEquals(1, reloaded.detail(null, id).comments().size());
        assertNotNull(reloaded.me(owner.cookie.substring(owner.cookie.indexOf('=') + 1)));
        assertFalse(Files.readString(store).contains(owner.cookie.substring(owner.cookie.indexOf('=') + 1)));
        assertEquals(204, call(owner, "DELETE", "/posts/" + id, null).statusCode());
        assertEquals(404, call(neighbor, "GET", "/posts/" + id, null).statusCode());
    }
    @Test void marketplaceStatusAndPrivateConversations() throws Exception {
        var seller = actor(); var buyer = actor(); var stranger = actor();
        var body = post("market", "이동가방 나눔"); body.put("tradeType", "share"); body.put("price", -9);
        var created = ok(seller, "POST", "/posts", body); String id = created.path("item").path("post").path("id").asText();
        assertEquals(0, created.path("item").path("post").path("price").asInt());
        assertEquals(403, call(buyer, "PUT", "/posts/" + id + "/status", Map.of("status", "done")).statusCode());
        assertEquals("reserved", ok(seller, "PUT", "/posts/" + id + "/status", Map.of("status", "reserved")).path("item").path("post").path("status").asText());
        assertEquals(400, call(seller, "PUT", "/posts/" + id + "/status", Map.of()).statusCode());
        String chat = ok(buyer, "POST", "/conversations", Map.of("postId", id)).path("conversation").path("id").asText();
        assertEquals(chat, ok(buyer, "POST", "/conversations", Map.of("postId", id)).path("conversation").path("id").asText());
        assertEquals(403, call(stranger, "GET", "/conversations/" + chat, null).statusCode());
        assertEquals(403, call(stranger, "POST", "/conversations/" + chat + "/messages", Map.of("content", "접근 불가")).statusCode());
        ok(buyer, "POST", "/conversations/" + chat + "/messages", Map.of("content", "아직 나눔 가능한가요?"));
        assertEquals("아직 나눔 가능한가요?", ok(seller, "GET", "/conversations/" + chat, null).path("messages").get(0).path("message").path("content").asText());
        assertEquals(0, ok(stranger, "GET", "/conversations", null).size());
        ok(seller, "POST", "/conversations/" + chat + "/messages", Map.of("content", "네, 가능합니다."));
        assertEquals(2, ok(buyer, "GET", "/conversations/" + chat, null).path("messages").size());
        assertEquals(204, call(seller, "DELETE", "/posts/" + id, null).statusCode());
        assertEquals("삭제된 게시글", ok(buyer, "GET", "/conversations/" + chat, null).path("conversation").path("title").asText());
    }
    @Test void meetingCapacityCancellationValidationAndFailedWriteRollback() throws Exception {
        var host = actor(); var first = actor(); var second = actor(); var body = post("walk", "함께 산책해요");
        body.put("meetingAt", Instant.now().plusSeconds(86400).toString()); body.put("meetingPlace", "공원 정문"); body.put("capacity", 2);
        String id = ok(host, "POST", "/posts", body).path("item").path("post").path("id").asText();
        assertEquals(2, ok(first, "PUT", "/posts/" + id + "/join", Map.of("enabled", true)).path("item").path("participantCount").asInt());
        assertEquals(409, call(second, "PUT", "/posts/" + id + "/join", Map.of("enabled", true)).statusCode());
        ok(first, "PUT", "/posts/" + id + "/join", Map.of("enabled", false));
        ok(second, "PUT", "/posts/" + id + "/join", Map.of("enabled", true));
        ok(host, "PUT", "/posts/" + id + "/status", Map.of("status", "done"));
        assertEquals(409, call(first, "PUT", "/posts/" + id + "/join", Map.of("enabled", true)).statusCode());
        assertEquals(400, call(host, "PUT", "/posts/" + id + "/join", Map.of("enabled", false)).statusCode());
        body.put("meetingAt", Instant.now().minusSeconds(60).toString()); assertEquals(400, call(host, "POST", "/posts", body).statusCode());
        body = post("market", "잘못된 가격"); body.put("tradeType", "sale"); body.put("price", -1); assertEquals(400, call(host, "POST", "/posts", body).statusCode());
        body = post("info", "허용하지 않는 이미지"); body.put("image", "data:image/svg+xml;base64,aaaa"); assertEquals(400, call(host, "POST", "/posts", body).statusCode());
        assertEquals(400, call(null, "GET", "/posts?page=0", null).statusCode());
        // A parent path that is a file makes persistence fail; no phantom account may remain.
        Path blocked = Files.createTempFile("community-blocked-", ".tmp");
        var brokenStore = new CommunityService(mapper, catalog, blocked.resolve("community.json").toString());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> brokenStore.saveProfile("token", new CommunityService.ProfileInput("테스트이웃", "", "11", "")));
        assertNull(brokenStore.me("token"));
    }
}
