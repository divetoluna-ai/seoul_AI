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
import java.util.Base64;
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
    private final HttpClient browser = HttpClient.newHttpClient();

    record Attempt(String cookie, String state, String challenge) {}

    @BeforeEach void resetProvider() { provider.reset(); }
    @AfterEach void verifyProvider() { provider.verify(); }

    @Test void registersOnceAndLogsInAgainAfterLogout() throws Exception {
        var guest = session(null);
        assertTrue(guest.path("enabled").asBoolean());
        assertTrue(guest.path("user").isNull());

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
        var sameMember = session(cookie(again)).path("user");
        assertEquals(member.path("id"), sameMember.path("id"));
        assertEquals("새 닉네임", sameMember.path("nickname").asString());
        assertTrue(session(null).path("user").isNull());

        Path file = dataDir.resolve("members.json");
        String saved = Files.readString(file);
        assertEquals(1, mapper.readTree(saved).size());
        assertFalse(saved.contains("provider-token"));
        var reopened = new MemberStore(mapper, file.toString());
        assertEquals(sameMember.path("id").asString(), reopened.signIn(new KakaoLoginClient.User(KAKAO_USER_ID, "새 닉네임")).id());
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
                .andRespond(withSuccess(mapper.writeValueAsString(Map.of("id", KAKAO_USER_ID,
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
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth" + suffix));
        if (cookie != null) request.header("Cookie", cookie);
        if (sameOrigin) request.header("X-Auth-Client", "web");
        return browser.send(request.method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    private static void assertRedirect(String location, HttpResponse<String> response) {
        assertEquals(303, response.statusCode());
        assertEquals(location, response.headers().firstValue("location").orElseThrow());
        assertEquals("no-referrer", response.headers().firstValue("referrer-policy").orElseThrow());
    }

    private static String cookie(HttpResponse<String> response) {
        String cookie = response.headers().firstValue("set-cookie").orElseThrow();
        assertTrue(cookie.startsWith("daeng-session="));
        assertTrue(cookie.contains("Path=/api/auth"));
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("SameSite=Lax"));
        return cookie.split(";", 2)[0];
    }
}
