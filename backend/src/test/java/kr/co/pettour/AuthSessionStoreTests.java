package kr.co.pettour;

import java.nio.file.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class AuthSessionStoreTests {
    @TempDir Path root;
    final ObjectMapper mapper = new ObjectMapper();
    final TestClock clock = new TestClock();
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-11-14T00:00:00Z");
        void advance(Duration duration) { now = now.plus(duration); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
    Path file() { return root.resolve("auth-sessions.json"); }
    AuthSessionStore open() throws Exception { return new AuthSessionStore(mapper, file().toString(), clock); }

    @Test void restartRestoresPendingLoginAndAuthenticatedSessionWithoutStoringBrowserTokens() throws Exception {
        var attempt = open().begin(null, "community");
        String pending = Files.readString(file());
        assertFalse(pending.contains(attempt.token())); assertFalse(pending.contains(attempt.state()));
        assertNull(open().consume(attempt.token(), "wrong"));
        assertNull(open().consume("wrong", attempt.state()));
        var restored = open().consume(attempt.token(), attempt.state());
        assertNotNull(restored); assertEquals(attempt.verifier(), restored.verifier()); assertEquals("community", restored.section());
        assertNull(open().consume(attempt.token(), attempt.state()), "Consumed callbacks remain consumed after restart");
        String token = open().signIn("member-1");
        assertEquals("member-1", open().memberId(token));
        assertNull(open().memberId(attempt.token())); assertNull(open().memberId(null));
        String saved = Files.readString(file()); assertFalse(saved.contains(token)); assertFalse(saved.contains(attempt.verifier()));
        assertTrue(mapper.readTree(saved).path("attempts").isEmpty());
    }

    @Test void expiryIsEnforcedAfterRestartAndExpiredRecordsArePrunedOnWrites() throws Exception {
        var store = open();
        var attempt = store.begin(null, "explore"); String token = store.signIn("member-1");
        clock.advance(AuthSessionStore.LOGIN_WINDOW);
        assertNull(open().consume(attempt.token(), attempt.state()));
        assertEquals("member-1", open().memberId(token));
        clock.advance(AuthSessionStore.SESSION_TIMEOUT.minus(AuthSessionStore.LOGIN_WINDOW));
        assertNull(open().memberId(token));
        open().begin(null, "");
        var json = mapper.readTree(Files.readString(file()));
        assertTrue(json.path("sessions").isEmpty()); assertEquals(1, json.path("attempts").size());
    }

    @Test void logoutRevokesOnlyThatBrowserAndPersistsAcrossRestarts() throws Exception {
        var store = open(); String first = store.signIn("member-1"), second = store.signIn("member-1");
        store.revoke(first);
        assertNull(open().memberId(first)); assertEquals("member-1", open().memberId(second));
        var attempt = open().begin(null, "community"); open().revoke(attempt.token());
        assertNull(open().consume(attempt.token(), attempt.state()));
    }

    @Test void newLoginAttemptReplacesOnlyThePreviousBrowserAttempt() throws Exception {
        var store = open(); var first = store.begin(null, "community"); var other = store.begin(null, "explore");
        var replacement = store.begin(first.token(), "explore");
        assertNull(open().consume(first.token(), first.state()));
        assertNotNull(open().consume(other.token(), other.state()));
        assertNotNull(open().consume(replacement.token(), replacement.state()));
    }

    @Test void writeFailureCannotCreateSessionsRevokeSessionsOrConsumeLoginAttemptsInMemory() throws Exception {
        var store = open(); String token = store.signIn("member-1"); var attempt = store.begin(null, "community");
        String saved = Files.readString(file());
        Files.delete(file()); Files.createDirectory(file()); Files.writeString(file().resolve("blocker"), "block replacement");
        assertThrows(ResponseStatusException.class, () -> store.signIn("member-2"));
        assertThrows(ResponseStatusException.class, () -> store.revoke(token));
        assertEquals("member-1", store.memberId(token));
        assertThrows(ResponseStatusException.class, () -> store.consume(attempt.token(), attempt.state()));
        Files.delete(file().resolve("blocker")); Files.delete(file()); Files.writeString(file(), saved);
        assertNotNull(store.consume(attempt.token(), attempt.state()));
        assertEquals("member-1", open().memberId(token));
    }

    @Test void corruptOrInvalidJsonStopsLoadingWithoutOverwritingTheFile() throws Exception {
        for (String invalid : new String[]{"{broken", "null", "{}", "{\"attempts\":[],\"sessions\":[null]}"}) {
            Files.writeString(file(), invalid);
            assertThrows(Exception.class, this::open); assertEquals(invalid, Files.readString(file()));
        }
    }
}
