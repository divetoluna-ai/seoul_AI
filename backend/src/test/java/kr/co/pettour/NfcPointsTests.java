package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static kr.co.pettour.CommunityService.*;

class NfcPointsTests {
    @TempDir Path root;
    final ObjectMapper mapper = new ObjectMapper();
    final TestClock clock = new TestClock("2026-11-14T03:00:00Z");
    static class TestClock extends Clock {
        Instant value;
        TestClock(String time) { value = Instant.parse(time); }
        void advance(long millis) { value = value.plusMillis(millis); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return value; }
    }
    CommunityService service() throws Exception {
        var service = new CommunityService(mapper, null, root.resolve("community.json").toString(), clock);
        service.saveProfile("a", new ProfileInput("보리네", "보리"));
        return service;
    }
    @Test void hourlyRatePauseResumeAndRestartPreserveFractions() throws Exception {
        var service = service();
        assertTrue(service.nfcProximity("a", true).nfc().active());
        for (int i = 0; i < 360; i++) { clock.advance(10_000); service.nfcHeartbeat("a"); }
        var stopped = service.nfcProximity("a", false);
        assertEquals(100.0 / 24, stopped.total(), 1e-10);
        assertEquals(3_600_000, stopped.nfc().millisToday());
        clock.advance(60_000); assertEquals(stopped.total(), service.points("a").total());
        service = new CommunityService(mapper, null, root.resolve("community.json").toString(), clock);
        assertEquals(stopped.total(), service.points("a").total());
        service.nfcProximity("a", true); clock.advance(5000); service.nfcProximity("a", false);
        assertEquals(3_605_000, service.points("a").nfc().millisToday());
    }
    @Test void unifiedProfileEditsUpdateLinkedDogWithoutResettingPointsOrTag() throws Exception {
        var service = service();
        var before = service.nfcProximity("a", true);
        clock.advance(5000); service.nfcHeartbeat("a");
        var profile = service.me("a");
        service.saveProfile("a", new ProfileInput("보리보호자", "보리새이름"));
        var after = service.points("a");
        assertEquals(profile.id(), service.me("a").id());
        assertEquals("보리새이름", after.nfc().petName());
        assertEquals(before.nfc().tagId(), after.nfc().tagId());
        assertEquals(5000, after.nfc().millisToday());
        assertTrue(after.nfc().active());
        service = new CommunityService(mapper, null, root.resolve("community.json").toString(), clock);
        assertEquals(after.total(), service.points("a").total());
        assertEquals("보리새이름", service.points("a").nfc().petName());
    }
    @Test void repeatedStartMultipleTabsAndExpiredConnectionsDoNotMultiplyTime() throws Exception {
        var service = service(); service.nfcProximity("a", true);
        clock.advance(5000); service.nfcProximity("a", true);
        service.nfcHeartbeat("a"); service.nfcHeartbeat("a");
        assertEquals(5000, service.points("a").nfc().millisToday());
        clock.advance(60_000);
        assertFalse(service.points("a").nfc().active());
        assertEquals(20_000, service.points("a").nfc().millisToday());
        var reloaded = new CommunityService(mapper, null, root.resolve("community.json").toString(), clock);
        assertEquals(20_000, reloaded.nfcHeartbeat("a").nfc().millisToday());
        clock.advance(60_000); assertEquals(20_000, reloaded.points("a").nfc().millisToday());
    }
    @Test void midnightSplitsElapsedTimeIntoKoreanCalendarDays() throws Exception {
        clock.value = Instant.parse("2026-11-14T14:59:55Z");
        var service = service(); service.nfcProximity("a", true); clock.advance(10_000);
        var result = service.nfcHeartbeat("a");
        assertEquals("2026-11-15", result.nfc().date()); assertEquals(5000, result.nfc().millisToday());
        assertEquals(10_000 * 100.0 / NFC_DAY_MS, result.total(), 1e-10);
        assertEquals(2, result.history().stream().filter(h -> h.reason().equals("nfc")).count());
    }
    @Test void dailyCapIsIndependentOfCommunityPointsAndUsers() throws Exception {
        var service = service(); String userId = service.me("a").id();
        service.saveProfile("b", new ProfileInput("다른이웃", "콩이"));
        Path file = root.resolve("community.json"); var old = mapper.readValue(Files.readString(file), Snapshot.class);
        var seeded = new Snapshot(old.accounts(), old.courses(),
            new ArrayList<>(List.of(new PointEntry(userId, "share", "test", 10, clock.instant().toString()))), old.shares(),
            new ArrayList<>(List.of(new NfcDay(userId, "2026-11-14", NFC_DAY_MS - 1000))), new ArrayList<>());
        Files.writeString(file, mapper.writeValueAsString(seeded));
        service = new CommunityService(mapper, null, file.toString(), clock);
        service.nfcProximity("a", true); clock.advance(10_000); service.nfcHeartbeat("a");
        assertEquals(100, service.points("a").nfc().pointsToday()); assertEquals(110, service.points("a").total());
        clock.advance(10_000); service.nfcHeartbeat("a"); assertEquals(110, service.points("a").total());
        assertEquals(0, service.points("b").total()); assertFalse(service.points("b").nfc().active());
    }
    @Test void petRegistrationAuthenticationAndWriteRollbackAreRequired() throws Exception {
        var service = service();
        assertThrows(ResponseStatusException.class, () -> service.nfcProximity(null, true));
        assertThrows(ResponseStatusException.class, () -> service.nfcHeartbeat(null));
        service.saveProfile("b", new ProfileInput("이름없는이웃", ""));
        assertThrows(ResponseStatusException.class, () -> service.nfcProximity("b", true));
        service.nfcProximity("a", true); clock.advance(5000);
        Path file = root.resolve("community.json"); Files.delete(file); Files.createDirectory(file); Files.writeString(file.resolve("block"), "block replacement");
        assertThrows(ResponseStatusException.class, () -> service.nfcProximity("a", false));
        assertTrue(service.points("a").nfc().active());
        Files.delete(file.resolve("block")); Files.delete(file);
        assertEquals(5000, service.nfcProximity("a", false).nfc().millisToday());
    }
}
