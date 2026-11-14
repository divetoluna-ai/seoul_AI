package kr.co.pettour;

import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "tour.api-key=")
class PointShopAccessTests {
    @TempDir static Path data;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("auth.members-file", () -> data.resolve("members.json").toString());
        registry.add("auth.sessions-file", () -> data.resolve("sessions.json").toString());
        registry.add("community.store", () -> data.resolve("community.json").toString());
    }
    @LocalServerPort int port;
    @Autowired AuthSessionStore sessions;
    @Autowired MemberStore members;
    @Autowired PointShopController shop;
    final HttpClient browser = HttpClient.newHttpClient();
    HttpResponse<String> get(String path, String cookie) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (cookie != null) request.header("Cookie", cookie);
        return browser.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void onlyLiveMemberSessionsCanReadCatalogEvenWhenItIsCached() throws Exception {
        ReflectionTestUtils.setField(shop, "cached", new PointShopController.Catalog(PointShopController.SOURCE, Instant.now().toString(), false,
            List.of(new PointShopController.Product("67", "고글", 10000, "https://ecimg.cafe24img.com/test.png", "https://www.adorable-dog.com/product/goggles/67/", false))));
        assertEquals(401, get("/api/auth/shop/products", null).statusCode());
        assertEquals(401, get("/api/shop/products", null).statusCode());
        assertEquals(401, get("/api/auth/shop/products", "daeng-session=invalid; daeng-community=profile-only").statusCode());
        var member = members.signIn(new KakaoLoginClient.User(777L, "상점 테스트"));
        String token = sessions.signIn(member.member().id());
        var allowed = get("/api/auth/shop/products", "daeng-session=" + token);
        assertEquals(200, allowed.statusCode());
        assertTrue(allowed.body().contains("10000"));
        assertEquals("no-store", allowed.headers().firstValue("Cache-Control").orElseThrow());
        sessions.revoke(token);
        assertEquals(401, get("/api/auth/shop/products", "daeng-session=" + token).statusCode());
    }
}
