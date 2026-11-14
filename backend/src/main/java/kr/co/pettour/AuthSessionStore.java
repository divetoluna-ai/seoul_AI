package kr.co.pettour;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Single-process JSON persistence for login attempts and revocable browser sessions. */
@Service
class AuthSessionStore {
    static final Duration LOGIN_WINDOW = Duration.ofMinutes(10);
    static final Duration SESSION_TIMEOUT = Duration.ofHours(12);
    private static final SecureRandom RANDOM = new SecureRandom();

    record Attempt(String token, String state, String verifier, String section) {}
    record StoredAttempt(String tokenHash, String stateHash, String verifier, String section, long expiresAt) {}
    record Session(String tokenHash, String memberId, long expiresAt) {}
    record Snapshot(List<StoredAttempt> attempts, List<Session> sessions) {}

    private final ObjectMapper mapper;
    private final Path file;
    private final Clock clock;
    private Snapshot db;

    @Autowired
    AuthSessionStore(ObjectMapper mapper, @Value("${auth.sessions-file:./data/auth-sessions.json}") String filename) throws IOException {
        this(mapper, filename, Clock.systemUTC());
    }

    AuthSessionStore(ObjectMapper mapper, String filename, Clock clock) throws IOException {
        this.mapper = mapper;
        this.file = Path.of(filename).toAbsolutePath();
        this.clock = clock;
        db = Files.exists(file) ? mapper.readValue(Files.readString(file), Snapshot.class) : new Snapshot(List.of(), List.of());
        if (db == null || db.attempts() == null || db.sessions() == null
                || db.attempts().stream().anyMatch(a -> a == null || !digest(a.tokenHash()) || !digest(a.stateHash())
                    || !token(a.verifier()) || a.section() == null || !Set.of("", "community", "explore", "shop").contains(a.section()) || a.expiresAt() <= 0)
                || db.sessions().stream().anyMatch(s -> s == null || !digest(s.tokenHash()) || s.memberId() == null
                    || s.memberId().isBlank() || s.expiresAt() <= 0))
            throw new IOException("Invalid authentication session store");
    }

    synchronized Attempt begin(String previousToken, String section) {
        var attempt = new Attempt(randomValue(), randomValue(), randomValue(), section);
        long now = clock.millis();
        String previousHash = token(previousToken) ? hash(previousToken) : "";
        var attempts = new ArrayList<>(db.attempts().stream()
                .filter(a -> a.expiresAt() > now && !a.tokenHash().equals(previousHash)).toList());
        attempts.add(new StoredAttempt(hash(attempt.token()), hash(attempt.state()), attempt.verifier(), section, now + LOGIN_WINDOW.toMillis()));
        persist(new Snapshot(attempts, liveSessions(now)));
        return attempt;
    }

    synchronized StoredAttempt consume(String browserToken, String state) {
        if (!token(browserToken) || !token(state)) return null;
        String tokenHash = hash(browserToken), stateHash = hash(state);
        var attempt = db.attempts().stream().filter(a -> a.tokenHash().equals(tokenHash) && a.expiresAt() > clock.millis()
                && MessageDigest.isEqual(a.stateHash().getBytes(StandardCharsets.US_ASCII), stateHash.getBytes(StandardCharsets.US_ASCII)))
                .findFirst().orElse(null);
        if (attempt == null) return null;
        // Persist consumption before exchanging the code, so callbacks cannot be replayed after restart.
        long now = clock.millis();
        persist(new Snapshot(db.attempts().stream().filter(a -> a.expiresAt() > now && !a.tokenHash().equals(tokenHash)).toList(), liveSessions(now)));
        return attempt;
    }

    synchronized String memberId(String browserToken) {
        if (!token(browserToken)) return null;
        String tokenHash = hash(browserToken);
        return db.sessions().stream().filter(s -> s.tokenHash().equals(tokenHash) && s.expiresAt() > clock.millis())
                .map(Session::memberId).findFirst().orElse(null);
    }

    synchronized String signIn(String memberId) {
        if (memberId == null || memberId.isBlank()) throw new IllegalArgumentException("Member is required");
        long now = clock.millis();
        String browserToken = randomValue();
        var sessions = new ArrayList<>(liveSessions(now));
        sessions.add(new Session(hash(browserToken), memberId, now + SESSION_TIMEOUT.toMillis()));
        persist(new Snapshot(db.attempts().stream().filter(a -> a.expiresAt() > now).toList(), sessions));
        return browserToken;
    }

    synchronized void revoke(String browserToken) {
        if (!token(browserToken)) return;
        String tokenHash = hash(browserToken);
        long now = clock.millis();
        var next = new Snapshot(db.attempts().stream().filter(a -> a.expiresAt() > now && !a.tokenHash().equals(tokenHash)).toList(),
                liveSessions(now).stream().filter(s -> !s.tokenHash().equals(tokenHash)).toList());
        if (!next.equals(db)) persist(next);
    }

    private List<Session> liveSessions(long now) {
        return db.sessions().stream().filter(s -> s.expiresAt() > now).toList();
    }

    private void persist(Snapshot next) {
        try {
            Files.createDirectories(file.getParent());
            Path temp = Files.createTempFile(file.getParent(), "auth-sessions-", ".tmp");
            try {
                Files.writeString(temp, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(next));
                try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException ex) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
            } finally { Files.deleteIfExists(temp); }
            db = next;
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "로그인 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
    }

    private static boolean token(String value) { return value != null && value.matches("[A-Za-z0-9_-]{43}"); }
    private static boolean digest(String value) { return value != null && value.matches("[a-f0-9]{64}"); }
    private static String randomValue() {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
