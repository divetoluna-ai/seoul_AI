package kr.co.pettour;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"tour.api-key=", "kakao.photos.enabled=false"})
class AvatarPersistenceTests {
    @TempDir static Path data;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("auth.members-file", () -> data.resolve("members.json").toString());
        r.add("auth.sessions-file", () -> data.resolve("sessions.json").toString());
        r.add("community.store", () -> data.resolve("community.json").toString());
        r.add("avatar.store", () -> data.resolve("avatars.json").toString());
    }
    @LocalServerPort int port;
    @Autowired AuthSessionStore sessions;
    @Autowired MemberStore members;
    @Autowired CommunityService community;
    @Autowired ObjectMapper mapper;
    final HttpClient browser = HttpClient.newHttpClient();
    HttpResponse<String> call(String pet, String token, JsonNode body, boolean header) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/avatar?pet=" + pet));
        if (token != null) request.header("Cookie", "daeng-session=" + token);
        if (header) request.header("X-Auth-Client", "web");
        if (body == null) request.GET();
        else request.header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return browser.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void savedRoomRequiresLoginAndOwnershipAndReloadsWithCurrentRegisteredName() throws Exception {
        var owner = members.signIn(new KakaoLoginClient.User(901L, "보호자")).member();
        var other = members.signIn(new KakaoLoginClient.User(902L, "이웃")).member();
        var dog = members.saveDog(owner, null, new MemberStore.DogInput("보리", 30), false);
        String pet = "dog:" + dog.id(), token = sessions.signIn(owner.id()), neighbor = sessions.signIn(other.id());
        assertEquals(401, call(pet, null, null, false).statusCode());
        assertEquals(401, call(pet, null, AvatarDesignStoreTests.design(), true).statusCode());
        assertEquals(403, call(pet, token, AvatarDesignStoreTests.design(), false).statusCode());
        assertEquals(404, call(pet, neighbor, null, false).statusCode());
        assertEquals(404, call(pet, neighbor, AvatarDesignStoreTests.design(), true).statusCode());
        assertTrue(mapper.readTree(call(pet, token, null, false).body()).path("design").isNull());
        var input = AvatarDesignStoreTests.design(); input.put("name", "잘못된 이름");
        assertEquals(200, call(pet, token, input, true).statusCode());
        members.saveDog(owner, dog.id(), new MemberStore.DogInput("새 이름", 30), false);
        String secondDevice = sessions.signIn(owner.id());
        var reloaded = call(pet, secondDevice, null, false);
        assertEquals(200, reloaded.statusCode());
        assertEquals("no-store", reloaded.headers().firstValue("Cache-Control").orElseThrow());
        assertEquals("새 이름", mapper.readTree(reloaded.body()).path("design").path("name").asString());
        assertTrue(Files.readString(data.resolve("avatars.json")).contains("furniture"));
        sessions.revoke(token);
        assertEquals(401, call(pet, token, null, false).statusCode());
    }
    @Test void sharedLoginProfileRoomUsesVerifiedAccountInsteadOfClientSuppliedIdentity() throws Exception {
        var member = members.signIn(new KakaoLoginClient.User(903L, "프로필 보호자")).member();
        var profile = community.saveProfile("member:" + member.id(), new CommunityService.ProfileInput("보리와산책", "보리"));
        String token = sessions.signIn(member.id()), pet = "profile:" + profile.id();
        assertEquals(200, call(pet, token, AvatarDesignStoreTests.design(), true).statusCode());
        assertEquals(404, call("profile:another-user", token, null, false).statusCode());
        assertEquals("보리", mapper.readTree(call(pet, token, null, false).body()).path("design").path("name").asString());
    }
}
