package kr.co.pettour;

import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Small design settings only; model files remain shared static assets. Single-process JSON store. */
@Service
class AvatarDesignStore {
    record Entry(String memberId, String petId, JsonNode design, String updatedAt) {}
    record Snapshot(List<Entry> designs) {}
    private final ObjectMapper mapper;
    private final Path file;
    private Snapshot snapshot;

    AvatarDesignStore(ObjectMapper mapper, @Value("${avatar.store:./data/avatar-designs.json}") String filename) throws IOException {
        this.mapper = mapper;
        file = Path.of(filename).toAbsolutePath();
        snapshot = Files.exists(file) ? mapper.readValue(Files.readString(file), Snapshot.class) : new Snapshot(List.of());
        if (snapshot == null || snapshot.designs() == null) throw new IOException("Invalid avatar design store");
        var keys = new HashSet<String>();
        for (var entry : snapshot.designs()) {
            if (entry == null || entry.memberId() == null || entry.petId() == null || entry.updatedAt() == null
                    || !keys.add(entry.memberId() + "/" + entry.petId())) throw new IOException("Invalid avatar design entry");
            validate(entry.design());
        }
    }

    synchronized JsonNode find(String memberId, String petId) {
        return snapshot.designs().stream().filter(e -> e.memberId().equals(memberId) && e.petId().equals(petId))
                .map(e -> e.design().deepCopy()).findFirst().orElse(null);
    }

    synchronized JsonNode save(String memberId, String petId, JsonNode design) {
        validate(design);
        var entries = new ArrayList<>(snapshot.designs());
        entries.removeIf(e -> e.memberId().equals(memberId) && e.petId().equals(petId));
        entries.add(new Entry(memberId, petId, design.deepCopy(), Instant.now().toString()));
        var next = new Snapshot(List.copyOf(entries));
        try {
            Files.createDirectories(file.getParent());
            Path temp = Files.createTempFile(file.getParent(), "avatar-designs-", ".tmp");
            try {
                Files.writeString(temp, mapper.writeValueAsString(next));
                try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException ex) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
                snapshot = next;
            } finally { Files.deleteIfExists(temp); }
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "아바타 디자인을 저장하지 못했어요. 다시 저장해주세요.");
        }
        return design.deepCopy();
    }

    private static void validate(JsonNode d) {
        if (d == null || !d.isObject() || d.toString().length() > 32000
                || !Set.of("dog", "cat").contains(d.path("species").asString(""))
                || !"realistic".equals(d.path("renderMode").asString(""))
                || !text(d, "name", 20) || !text(d, "breedId", 64) || !text(d, "outfitId", 64)) invalid();
        for (var field : List.of("fur", "collar", "wall", "floor", "rugColor"))
            if (!d.path(field).asString("").matches("#[0-9a-fA-F]{6}")) invalid();
        if (!number(d, "size", .7, 1.3) || !number(d, "ears", .6, 1.4) || !number(d, "rotation", -180, 180)
                || !number(d, "fitEase", .015, .09) || !number(d, "fitWidth", .85, 1.15) || !number(d, "fitLength", .75, 1.1)
                || !d.path("rug").isBoolean() || !d.path("collarEnabled").isBoolean()
                || !d.path("furniture").isArray() || d.path("furniture").size() > 12) invalid();
        var ids = new HashSet<String>();
        for (var f : d.path("furniture")) {
            if (!f.isObject() || !text(f, "id", 100) || !ids.add(f.path("id").asString())
                    || !Set.of("bed", "sofa", "plant", "bowl").contains(f.path("type").asString(""))
                    || !f.path("color").asString("").matches("#[0-9a-fA-F]{6}")
                    || !number(f, "x", -2.5, 2.5) || !number(f, "z", -2.5, 2.5) || !number(f, "rotation", -180, 180)) invalid();
        }
    }
    private static boolean text(JsonNode d, String field, int max) {
        return d.path(field).isString() && !d.path(field).asString().isBlank() && d.path(field).asString().length() <= max;
    }
    private static boolean number(JsonNode d, String field, double min, double max) {
        var n = d.path(field);
        return n.isNumber() && Double.isFinite(n.asDouble()) && n.asDouble() >= min && n.asDouble() <= max;
    }
    private static void invalid() { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "아바타 디자인 정보를 확인해주세요."); }
}
