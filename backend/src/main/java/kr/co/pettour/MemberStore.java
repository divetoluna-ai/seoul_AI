package kr.co.pettour;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
class MemberStore {
    private static final Duration DOG_SETUP_SNOOZE = Duration.ofDays(3);

    record Member(String id, String nickname) {}
    record SignIn(Member member, boolean showDogSetup) {}
    enum DogSize { SMALL, MEDIUM, LARGE }
    record DogInput(String name, DogSize size, Integer age, Integer walkMinutes) {}
    @JsonIgnoreProperties({"avoidStairs", "preferShade", "preferQuiet"})
    record DogProfile(String id, String name, DogSize size, Integer age, int walkMinutes, boolean publicProfile) {}
    record PublicDog(String name, DogSize size) {}
    record Account(String id, String nickname, List<DogProfile> dogs, Instant dogSetupHiddenUntil) {
        Account {
            dogs = dogs == null ? List.of() : List.copyOf(dogs);
        }

        Member member() { return new Member(id, nickname); }

        SignIn signIn() {
            return new SignIn(member(), showDogSetup());
        }

        boolean showDogSetup() { return dogSetupHiddenUntil == null || !Instant.now().isBefore(dogSetupHiddenUntil); }
    }

    private final ObjectMapper mapper;
    private final Path file;
    private Map<Long, Account> members;

    MemberStore(ObjectMapper mapper, @Value("${auth.members-file}") String filename) throws IOException {
        this.mapper = mapper;
        this.file = Path.of(filename).toAbsolutePath();
        this.members = Files.exists(file)
                ? mapper.readValue(Files.readString(file), new TypeReference<Map<Long, Account>>() {})
                : Map.of();
    }

    synchronized SignIn signIn(KakaoLoginClient.User user) throws IOException {
        var existing = members.get(user.id());
        String nickname = user.nickname().isBlank() ? "카카오 회원" : user.nickname().strip();
        if (existing != null && existing.nickname().equals(nickname)) return existing.signIn();

        var account = existing == null
                ? new Account(UUID.randomUUID().toString(), nickname, List.of(), null)
                : new Account(existing.id(), nickname, existing.dogs(), existing.dogSetupHiddenUntil());
        save(user.id(), account);
        return account.signIn();
    }

    synchronized List<DogProfile> dogs(Member member) {
        return owner(member).getValue().dogs();
    }

    synchronized Member find(String id) {
        return id == null ? null : members.values().stream().filter(account -> account.id().equals(id))
                .map(Account::member).findFirst().orElse(null);
    }

    synchronized boolean showDogSetup(Member member) {
        return owner(member).getValue().showDogSetup();
    }

    synchronized DogProfile dog(Member member, String id) {
        return dogs(member).stream().filter(dog -> dog.id().equals(id))
                .findFirst().orElseThrow(MemberStore::dogNotFound);
    }

    synchronized PublicDog publicDog(String id) {
        return members.values().stream().flatMap(account -> account.dogs().stream())
                .filter(dog -> dog.id().equals(id) && dog.publicProfile())
                .map(dog -> new PublicDog(dog.name(), dog.size()))
                .findFirst().orElseThrow(MemberStore::dogNotFound);
    }

    synchronized DogProfile saveDog(Member member, String id, DogInput input, boolean hideSetup) throws IOException {
        var entry = owner(member);
        var existing = id == null ? null : dog(member, id);
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty() || name.length() > 20 || input.size() == null
                || (input.age() != null && (input.age() < 0 || input.age() > 40))
                || input.walkMinutes() == null || input.walkMinutes() < 1 || input.walkMinutes() > 600) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "반려견 이름, 크기, 나이와 산책 시간을 확인해주세요.");
        }
        var dog = new DogProfile(existing == null ? UUID.randomUUID().toString() : existing.id(), name,
                input.size(), input.age(), input.walkMinutes(), existing != null && existing.publicProfile());
        return saveDog(entry, existing, dog, hideSetup);
    }

    synchronized void hideDogSetup(Member member) throws IOException {
        var entry = owner(member);
        var account = entry.getValue();
        save(entry.getKey(), new Account(account.id(), account.nickname(), account.dogs(), Instant.now().plus(DOG_SETUP_SNOOZE)));
    }

    synchronized DogProfile setDogVisibility(Member member, String id, boolean publicProfile) throws IOException {
        var entry = owner(member);
        var dog = dog(member, id);
        if (dog.publicProfile() == publicProfile) return dog;
        var updated = new DogProfile(dog.id(), dog.name(), dog.size(), dog.age(), dog.walkMinutes(), publicProfile);
        return saveDog(entry, dog, updated, false);
    }

    private DogProfile saveDog(Map.Entry<Long, Account> entry, DogProfile existing, DogProfile dog, boolean hideSetup) throws IOException {
        var account = entry.getValue();
        var dogs = new ArrayList<>(account.dogs());
        if (existing == null) dogs.add(dog);
        else dogs.set(dogs.indexOf(existing), dog);
        var hiddenUntil = hideSetup ? Instant.now().plus(DOG_SETUP_SNOOZE) : account.dogSetupHiddenUntil();
        save(entry.getKey(), new Account(account.id(), account.nickname(), dogs, hiddenUntil));
        return dog;
    }

    private Map.Entry<Long, Account> owner(Member member) {
        return members.entrySet().stream().filter(entry -> entry.getValue().id().equals(member.id()))
                .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private static ResponseStatusException dogNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "볼 수 있는 반려견 프로필이 없어요.");
    }

    private void save(long providerId, Account account) throws IOException {
        var updated = new HashMap<>(members);
        updated.put(providerId, account);

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
    }
}
