package kr.co.pettour;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
class MemberStore {
    record Member(String id, String nickname) {}

    private final ObjectMapper mapper;
    private final Path file;
    private Map<Long, Member> members;

    MemberStore(ObjectMapper mapper, @Value("${auth.members-file}") String filename) throws IOException {
        this.mapper = mapper;
        this.file = Path.of(filename).toAbsolutePath();
        this.members = Files.exists(file)
                ? mapper.readValue(Files.readString(file), new TypeReference<Map<Long, Member>>() {})
                : Map.of();
    }

    synchronized Member signIn(KakaoLoginClient.User user) throws IOException {
        var existing = members.get(user.id());
        String nickname = user.nickname().isBlank() ? "카카오 회원" : user.nickname().strip();
        if (existing != null && existing.nickname().equals(nickname)) return existing;

        var member = new Member(existing == null ? UUID.randomUUID().toString() : existing.id(), nickname);
        var updated = new HashMap<>(members);
        updated.put(user.id(), member);

        Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(file.getParent(), "members-", ".tmp");
        try {
            Files.writeString(temp, mapper.writeValueAsString(updated));
            try {
                Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
            members = updated;
        } finally {
            Files.deleteIfExists(temp);
        }
        return member;
    }
}
