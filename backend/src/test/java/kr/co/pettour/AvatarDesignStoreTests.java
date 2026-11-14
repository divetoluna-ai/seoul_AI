package kr.co.pettour;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class AvatarDesignStoreTests {
    @TempDir Path data;
    static final ObjectMapper mapper = new ObjectMapper();
    static ObjectNode design() {
        return (ObjectNode) mapper.readTree("""
            {"name":"보리","renderMode":"realistic","species":"dog","breedId":"maltese","outfitId":"none",
             "fitEase":0.035,"fitLength":1,"fitWidth":1,"fur":"#d7ad79","size":1,"ears":1,"rotation":15,
             "collarEnabled":true,"collar":"#718c76","wall":"#dbe2cf","floor":"#d7bd99","rug":true,"rugColor":"#eae0c9",
             "furniture":[{"id":"bed","type":"bed","color":"#9eaf96","x":-1.8,"z":0.8,"rotation":15}]}
            """);
    }
    @Test void roomAndOutfitSurviveRestartAndRemainScopedToAccountAndPet() throws Exception {
        var file = data.resolve("avatars.json");
        var store = new AvatarDesignStore(mapper, file.toString());
        var first = design(); first.put("outfitId", "outfit-12");
        store.save("member-a", "dog:a", first);
        store.save("member-b", "dog:a", design());
        first.put("wall", "#000000"); // Stored snapshots must not share mutable request objects.
        var restarted = new AvatarDesignStore(mapper, file.toString());
        assertEquals("outfit-12", restarted.find("member-a", "dog:a").path("outfitId").asString());
        assertEquals("#dbe2cf", restarted.find("member-a", "dog:a").path("wall").asString());
        assertEquals("none", restarted.find("member-b", "dog:a").path("outfitId").asString());
        assertNull(restarted.find("member-a", "dog:other"));
        assertTrue(mapper.readTree(Files.readString(file)).path("designs").isArray());
    }
    @Test void invalidSettingsCannotOverwriteSavedDesign() throws Exception {
        var file = data.resolve("avatars.json");
        var store = new AvatarDesignStore(mapper, file.toString());
        store.save("member-a", "dog:a", design());
        String before = Files.readString(file);
        var invalid = design(); invalid.put("size", 999);
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> store.save("member-a", "dog:a", invalid)).getStatusCode().value());
        assertEquals(before, Files.readString(file));
    }
    @Test void failedWritesLeaveLastSavedDesignIntact() throws Exception {
        var parent = data.resolve("blocked"); Files.writeString(parent, "not a directory");
        var store = new AvatarDesignStore(mapper, parent.resolve("avatars.json").toString());
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> store.save("member-a", "dog:a", design())).getStatusCode().value());
        assertNull(store.find("member-a", "dog:a"));
    }
}
