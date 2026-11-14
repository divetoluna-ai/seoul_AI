package kr.co.pettour;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

/** Restarts actual HTTP servers against the same temporary JSON files. No live Kakao requests. */
class JsonPersistenceRestartTests {
    @TempDir Path root;
    final HttpClient browser = HttpClient.newHttpClient();
    final ObjectMapper mapper = new ObjectMapper();

    @TestConfiguration(proxyBeanMethods = false)
    static class Provider {
        @Bean @Primary KakaoLoginClient restartKakaoClient() {
            return new KakaoLoginClient("test-key", "", "http://localhost:5173/api/auth/kakao/callback", RestClient.create()) {
                @Override User authenticate(String code, String verifier) { return new User(12345L, "재시작 여행자"); }
            };
        }
    }

    ConfigurableApplicationContext start() {
        return (ConfigurableApplicationContext) new SpringApplicationBuilder(PetTourApplication.class, Provider.class).run(
                "--server.port=0", "--tour.api-key=", "--kakao.photos.enabled=false",
                "--kakao.login.redirect-uri=http://localhost:5173/api/auth/kakao/callback",
                "--auth.members-file=" + root.resolve("members.json"),
                "--auth.sessions-file=" + root.resolve("auth-sessions.json"),
                "--community.store=" + root.resolve("courses.json"),
                "--logging.level.root=WARN", "--debug=false", "--spring.main.banner-mode=off");
    }

    HttpResponse<String> call(ConfigurableApplicationContext app, String method, String path, String cookie, Object body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + app.getEnvironment().getProperty("local.server.port") + path));
        if (cookie != null) request.header("Cookie", cookie);
        if (!method.equals("GET")) request.header("X-Auth-Client", "web").header("X-Community-Client", "web");
        if (body != null) request.header("Content-Type", "application/json");
        return browser.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
    }
    String cookie(HttpResponse<String> response) { return response.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0]; }
    String state(HttpResponse<String> response) {
        return UriComponentsBuilder.fromUriString(response.headers().firstValue("location").orElseThrow()).build().getQueryParams().getFirst("state");
    }

    @Test void loginCoursePendingCallbackAndLogoutSurviveFullServerRestarts() throws Exception {
        String loginCookie, memberId, courseId, profileCookie, pendingCookie, pendingState;
        try (var app = start()) {
            var attempt = call(app, "GET", "/api/auth/kakao?section=community", null, null);
            var authenticated = call(app, "GET", "/api/auth/kakao/callback?state=" + state(attempt) + "&code=approved", cookie(attempt), null);
            assertEquals(303, authenticated.statusCode()); loginCookie = cookie(authenticated);
            assertTrue(authenticated.headers().firstValue("set-cookie").orElseThrow().contains("Max-Age=43200"));
            assertTrue(authenticated.headers().firstValue("set-cookie").orElseThrow().contains("HttpOnly"));
            memberId = mapper.readTree(call(app, "GET", "/api/auth/session", loginCookie, null).body()).path("user").path("id").asText();
            assertFalse(memberId.isBlank());

            var profile = call(app, "POST", "/api/community/profile", loginCookie, Map.of("nickname", "재시작코스", "petName", "보리"));
            assertEquals(200, profile.statusCode()); profileCookie = loginCookie;
            var stops = app.getBean(CsvFacilities.class).inRegion("11").stream().map(CsvFacilities.Facility::place)
                    .filter(p -> !p.latitude().isBlank() && !p.longitude().isBlank()).limit(2)
                    .map(p -> Map.of("id", p.id(), "latitude", p.latitude(), "longitude", p.longitude())).toList();
            var course = call(app, "POST", "/api/community/courses", profileCookie,
                    Map.of("title", "재시작 후에도 남는 코스", "content", "JSON으로 저장되는 여행 코스입니다.", "region", "11", "stops", stops));
            assertEquals(201, course.statusCode(), course.body());
            courseId = mapper.readTree(course.body()).path("course").path("id").asText();
            var pending = call(app, "GET", "/api/auth/kakao?section=explore", null, null);
            pendingCookie = cookie(pending); pendingState = state(pending);
        }
        try (var app = start()) {
            var session = mapper.readTree(call(app, "GET", "/api/auth/session", loginCookie, null).body());
            assertEquals(memberId, session.path("user").path("id").asText());
            var course = call(app, "GET", "/api/community/courses/" + courseId, profileCookie, null);
            assertEquals(200, course.statusCode()); assertTrue(mapper.readTree(course.body()).path("mine").asBoolean());
            assertEquals(2, mapper.readTree(course.body()).path("course").path("stops").size());
            var callback = call(app, "GET", "/api/auth/kakao/callback?state=" + pendingState + "&code=approved", pendingCookie, null);
            assertEquals("/#explore", callback.headers().firstValue("location").orElseThrow());
            assertEquals(204, call(app, "POST", "/api/auth/logout", loginCookie, null).statusCode());
        }
        try (var app = start()) {
            assertTrue(mapper.readTree(call(app, "GET", "/api/auth/session", loginCookie, null).body()).path("user").isNull());
            assertEquals(200, call(app, "GET", "/api/community/courses/" + courseId, profileCookie, null).statusCode());
            var replay = call(app, "GET", "/api/auth/kakao/callback?state=" + pendingState + "&code=approved", pendingCookie, null);
            assertEquals("/?login=expired", replay.headers().firstValue("location").orElseThrow());
        }
        for (String filename : List.of("members.json", "auth-sessions.json", "courses.json"))
            assertTrue(Files.exists(root.resolve(filename)), filename);
        String saved = Files.readString(root.resolve("auth-sessions.json"));
        assertFalse(saved.contains(loginCookie.substring(loginCookie.indexOf('=') + 1)));
        assertFalse(saved.contains("provider-token"));
    }
}
