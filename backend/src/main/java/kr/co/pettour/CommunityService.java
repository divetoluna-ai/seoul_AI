package kr.co.pettour;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import static kr.co.pettour.Models.*;

/** Shared itineraries, with atomic single-process persistence. */
@Service
public class CommunityService {
    public record Profile(String id, String nickname, String petName) {}
    public record Account(String tokenHash, Profile profile) {}
    public record ProfileInput(String nickname, String petName) {}
    public record StopInput(String id, String latitude, String longitude) {}
    public record WalkConditions(Integer minutes, Set<MemberStore.DogSize> sizes, Boolean stairs, Boolean shade, Boolean quiet) {
        boolean matches(MemberStore.DogProfile dog) {
            return minutes != null && minutes <= dog.walkMinutes() && sizes != null && sizes.contains(dog.size());
        }
    }
    public record CourseInput(String title, String content, String region, List<StopInput> stops, WalkConditions walk) {}
    public record Course(String id, String authorId, String title, String content, String region,
                         List<Place> stops, String createdAt, String updatedAt, Set<String> likes, WalkConditions walk) {}
    public record PointEntry(String userId, String reason, String target, int amount, String createdAt) {}
    public record PointHistory(String reason, String target, double amount, String createdAt) {}
    public record NfcDay(String userId, String date, long millis) {}
    public record NfcSession(String userId, String petName, long startedAt, long cursorAt, long lastSeenAt) {}
    public record NfcView(boolean active, String petName, String tagId, String date, long millisToday,
                          double pointsToday, long serverNow, long activeUntil, long resetAt, long sessionStartedAt) {}
    public record PointsView(double total, List<PointHistory> history, NfcView nfc) {}
    public record SharedPlace(String id, String name, String address, String category, String latitude, String longitude) {}
    public record ShareInput(List<SharedPlace> stops) {}
    public record SharedTrip(String id, String ownerId, String fingerprint, List<SharedPlace> stops) {}
    public record SharedTripView(String id, List<SharedPlace> stops) {}
    public record ShareReward(double total, int awarded) {}
    public record Snapshot(List<Account> accounts, List<Course> courses, List<PointEntry> points,
                           List<SharedTrip> shares, List<NfcDay> nfcDays, List<NfcSession> nfcSessions) {
        public Snapshot {
            // Course snapshots created before rewards have no reward fields.
            points = points == null ? new ArrayList<>() : points;
            shares = shares == null ? new ArrayList<>() : shares;
            nfcDays = nfcDays == null ? new ArrayList<>() : nfcDays;
            nfcSessions = nfcSessions == null ? new ArrayList<>() : nfcSessions;
        }
    }
    public record PublicCourse(String id, String title, String content, String region, List<Place> stops, String createdAt, String updatedAt,
                               WalkConditions walk) {}
    public record CourseView(PublicCourse course, Profile author, int likeCount, boolean mine, boolean liked) {}
    public record Feed(List<CourseView> items, long total, int page, int pageSize) {}
    private final ObjectMapper mapper;
    private final Path file;
    private final CombinedPlaceService catalog;
    private final Clock clock;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    static final long NFC_DAY_MS = 86_400_000L;
    static final long NFC_LEASE_MS = 15_000L;
    private Snapshot db;

    @Autowired
    public CommunityService(ObjectMapper mapper, CombinedPlaceService catalog,
                            @Value("${community.store:./data/course-community.json}") String filename) throws java.io.IOException {
        this(mapper, catalog, filename, Clock.systemUTC());
    }
    CommunityService(ObjectMapper mapper, CombinedPlaceService catalog, String filename, Clock clock) throws java.io.IOException {
        this.mapper = mapper; this.catalog = catalog; this.clock = clock;
        Path requested = Path.of(filename).toAbsolutePath();
        // Older installations may explicitly configure the old board file. Preserve it untouched.
        if (Files.exists(requested) && mapper.readTree(Files.readString(requested)).has("posts"))
            requested = requested.resolveSibling("course-community.json");
        this.file = requested;
        db = Files.exists(file) ? mapper.readValue(Files.readString(file), Snapshot.class)
            : new Snapshot(new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>());
        if (db.accounts() == null || db.courses() == null) throw new java.io.IOException("Invalid course community store");
    }
    private static String id() { return UUID.randomUUID().toString(); }
    private static String now() { return Instant.now().toString(); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static String text(String value, int min, int max, String label) {
        String s = value == null ? "" : value.strip();
        if (s.length() < min || s.length() > max) throw bad(label + " 항목은 " + min + "~" + max + "자로 입력해주세요.");
        return s;
    }
    private static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    public synchronized Profile me(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return null;
        return db.accounts.stream().filter(a -> a.tokenHash.equals(hash(token))).map(Account::profile).findFirst().orElse(null);
    }
    private Profile require(String token) {
        var p = me(token);
        if (p == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "코스를 공유하려면 먼저 닉네임을 등록해주세요.");
        return p;
    }
    private Profile author(String id) { return db.accounts.stream().map(Account::profile).filter(p -> p.id.equals(id)).findFirst().orElseThrow(); }
    private <T> T write(Supplier<T> change) {
        var backup = mapper.writeValueAsString(db);
        try {
            T result = change.get();
            Files.createDirectories(file.getParent());
            Path temp = Files.createTempFile(file.getParent(), "course-community-", ".tmp");
            try {
                Files.writeString(temp, mapper.writeValueAsString(db));
                try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException ex) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
            } finally { Files.deleteIfExists(temp); }
            return result;
        } catch (Exception ex) {
            db = mapper.readValue(backup, Snapshot.class);
            if (ex instanceof ResponseStatusException status) throw status;
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "코스를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
    }
    public synchronized Profile saveProfile(String token, ProfileInput input) {
        String nickname = text(input.nickname, 2, 16, "닉네임"), pet = text(input.petName, 0, 20, "반려동물 이름");
        var existing = me(token);
        if (token == null || token.isBlank() || token.length() > 100) throw bad("프로필 세션을 확인해주세요.");
        if (db.accounts.stream().map(Account::profile).anyMatch(p -> p.nickname.equalsIgnoreCase(nickname) && (existing == null || !p.id.equals(existing.id))))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 닉네임이에요.");
        Profile profile = new Profile(existing == null ? id() : existing.id, nickname, pet);
        return write(() -> { db.accounts.removeIf(a -> a.profile.id.equals(profile.id)); db.accounts.add(new Account(hash(token), profile)); return profile; });
    }
    private Course find(String id) {
        return db.courses.stream().filter(p -> p.id.equals(id)).findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "삭제되었거나 존재하지 않는 코스예요."));
    }
    private void own(Course course, Profile user) {
        if (!course.authorId.equals(user.id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "내가 공유한 코스만 변경할 수 있어요.");
    }
    private CourseView view(Course p, Profile user) {
        return new CourseView(new PublicCourse(p.id, p.title, p.content, p.region, p.stops, p.createdAt, p.updatedAt, p.walk), author(p.authorId),
            p.likes.size(), user != null && p.authorId.equals(user.id), user != null && p.likes.contains(user.id));
    }
    public synchronized Feed feed(String token, String region, String keyword, String sort, int page, boolean mine, MemberStore.DogProfile dog) {
        if (!Set.of("recent", "popular").contains(sort) || page < 1 || page > 10000 || keyword.length() > 60) throw bad("검색 조건을 확인해주세요.");
        if (!region.isEmpty()) region(region);
        var user = mine ? require(token) : me(token);
        String q = CombinedPlaceService.normalize(keyword);
        Comparator<Course> byRecent = Comparator.comparing(Course::createdAt).reversed().thenComparing(Course::id);
        var results = db.courses.stream().filter(p -> region.isEmpty() || p.region.equals(region))
            .filter(p -> !mine || p.authorId.equals(user.id))
            .filter(p -> dog == null || (p.walk != null && p.walk.matches(dog)))
            .filter(p -> CombinedPlaceService.normalize(p.title + " " + p.content + " " + p.stops.stream().map(s -> s.name()+" "+s.address()).reduce("", (a,b) -> a+" "+b)).contains(q))
            .sorted(sort.equals("popular") ? Comparator.<Course>comparingInt(p -> p.likes.size()).reversed().thenComparing(byRecent) : byRecent).toList();
        return new Feed(results.stream().skip((long)(page - 1) * 12).limit(12).map(p -> view(p, user)).toList(), results.size(), page, 12);
    }
    private static WalkConditions walkConditions(WalkConditions walk) {
        if (walk == null) return null;
        if (walk.minutes == null || walk.minutes < 1 || walk.minutes > 600
                || walk.sizes == null || walk.sizes.isEmpty() || walk.sizes.contains(null))
            throw bad("산책 시간과 함께 걸을 수 있는 반려견 크기를 입력해주세요.");
        return walk;
    }
    public synchronized CourseView detail(String token, String id) { return view(find(id), me(token)); }
    private static void region(String code) {
        if (TourService.REGIONS.stream().noneMatch(r -> r.code().equals(code))) throw bad("코스의 대표 지역을 선택해주세요.");
    }
    private static boolean coordinate(String latitude, String longitude) {
        try { double y=Double.parseDouble(latitude), x=Double.parseDouble(longitude); return y>=32 && y<=39.5 && x>=124 && x<=132; }
        catch (RuntimeException ex) { return false; }
    }
    private List<Place> stops(List<StopInput> inputs) {
        if (inputs == null || inputs.size() < 2 || inputs.size() > 8) throw bad("코스에는 방문할 장소를 2~8곳 담아주세요.");
        var result = new ArrayList<Place>(); var seen = new HashSet<String>();
        for (var stop : inputs) {
            if (stop == null || stop.id == null || !stop.id.matches("[0-9]{1,20}|csv-[a-f0-9]{20}") || !seen.add(stop.id)) throw bad("장소를 중복 없이 선택해주세요.");
            if (!coordinate(stop.latitude, stop.longitude)) throw bad("장소의 위치를 확인한 뒤 코스를 공유해주세요.");
            Place p;
            try { p = catalog.detail(stop.id).place(); }
            catch (ResponseStatusException ex) { if (ex.getStatusCode().value() == 404) throw bad("목록에서 확인할 수 없는 장소가 있어요. 코스를 다시 만들어주세요."); throw ex; }
            if (coordinate(p.latitude(), p.longitude())) {
                double meters = Math.hypot((Double.parseDouble(p.latitude())-Double.parseDouble(stop.latitude))*111320,
                    (Double.parseDouble(p.longitude())-Double.parseDouble(stop.longitude))*111320*Math.cos(Math.toRadians(Double.parseDouble(p.latitude()))));
                if (meters > 75) throw bad("장소의 위치가 자료와 달라요. 장소를 다시 선택해주세요.");
            } else {
                p = new Place(p.id(), p.name(), p.category(), p.address(), p.image(), p.phone(), stop.longitude, stop.latitude,
                    p.modified(), p.source(), p.imageSource(), p.imagePage(), p.imageCollectedAt());
            }
            result.add(p);
        }
        return List.copyOf(result);
    }
    public synchronized CourseView create(String token, CourseInput input) {
        var user = require(token);
        String title = text(input.title, 2, 80, "코스 이름"), content = text(input.content, 5, 5000, "코스 소개");
        region(input.region); var stops = stops(input.stops); String time = now();
        var course = new Course(id(), user.id, title, content, input.region, stops, time, time, new HashSet<>(), walkConditions(input.walk));
        return write(() -> { db.courses.add(course); return view(course, user); });
    }
    public synchronized CourseView update(String token, String id, CourseInput input) {
        var user = require(token); var old = find(id); own(old, user);
        String title = text(input.title, 2, 80, "코스 이름"), content = text(input.content, 5, 5000, "코스 소개");
        region(input.region); var stops = stops(input.stops);
        var updated = new Course(old.id, old.authorId, title, content, input.region, stops, old.createdAt, now(), old.likes, walkConditions(input.walk));
        return write(() -> { db.courses.set(db.courses.indexOf(old), updated); return view(updated, user); });
    }
    public synchronized CourseView like(String token, String id, boolean liked) {
        var user = require(token); var course = find(id);
        return write(() -> { if (liked && course.likes.add(user.id)) award(user, "like", id, 1); else if (!liked) course.likes.remove(user.id); return view(course, user); });
    }
    public synchronized void delete(String token, String id) {
        var user = require(token); var course = find(id); own(course, user);
        write(() -> { db.courses.remove(course); return true; });
    }
    private int award(Profile user, String reason, String target, int amount) {
        if (db.points.stream().anyMatch(p -> p.userId.equals(user.id) && p.reason.equals(reason) && p.target.equals(target))) return 0;
        db.points.add(new PointEntry(user.id, reason, target, amount, now()));
        return amount;
    }
    private double total(Profile user) { return total(user, db.nfcDays); }
    private double total(Profile user, List<NfcDay> days) {
        return db.points.stream().filter(p -> p.userId.equals(user.id)).mapToLong(PointEntry::amount).sum()
            + days.stream().filter(d -> d.userId.equals(user.id)).mapToDouble(d -> nfcPoints(d.millis)).sum();
    }
    private static double nfcPoints(long millis) { return Math.min(100, millis * 100.0 / NFC_DAY_MS); }
    private NfcSession nfcSession(Profile user) { return db.nfcSessions.stream().filter(s -> s.userId.equals(user.id)).findFirst().orElse(null); }
    private static LocalDate seoulDate(long millis) { return Instant.ofEpochMilli(millis).atZone(SEOUL).toLocalDate(); }
    private static long nextMidnight(long millis) { return seoulDate(millis).plusDays(1).atStartOfDay(SEOUL).toInstant().toEpochMilli(); }
    private static void accrue(List<NfcDay> days, NfcSession session, long until) {
        long cursor = session.cursorAt;
        while (cursor < until) {
            long end = Math.min(until, nextMidnight(cursor)); String date = seoulDate(cursor).toString();
            var previous = days.stream().filter(d -> d.userId.equals(session.userId) && d.date.equals(date)).findFirst().orElse(null);
            long elapsed = Math.min(NFC_DAY_MS, (previous == null ? 0 : previous.millis) + end - cursor);
            if (previous != null) days.remove(previous);
            days.add(new NfcDay(session.userId, date, elapsed)); cursor = end;
        }
    }
    private void settleNfc(Profile user, long now) {
        var session = nfcSession(user); if (session == null) return;
        long until = Math.max(session.cursorAt, Math.min(now, session.lastSeenAt + NFC_LEASE_MS));
        accrue(db.nfcDays, session, until); db.nfcSessions.remove(session);
        if (now <= session.lastSeenAt + NFC_LEASE_MS) db.nfcSessions.add(new NfcSession(user.id, session.petName, session.startedAt, until, Math.max(now, session.lastSeenAt)));
    }
    public synchronized PointsView points(String token) {
        var user = require(token); long now = clock.millis(); var session = nfcSession(user);
        var projected = new ArrayList<>(db.nfcDays);
        if (session != null) accrue(projected, session, Math.min(now, session.lastSeenAt + NFC_LEASE_MS));
        String date = seoulDate(now).toString();
        long today = projected.stream().filter(d -> d.userId.equals(user.id) && d.date.equals(date)).mapToLong(NfcDay::millis).sum();
        var history = new ArrayList<PointHistory>();
        db.points.stream().filter(p -> p.userId.equals(user.id)).forEach(p -> history.add(new PointHistory(p.reason, p.target, p.amount, p.createdAt)));
        projected.stream().filter(d -> d.userId.equals(user.id) && d.millis > 0).forEach(d -> history.add(new PointHistory("nfc", d.date, nfcPoints(d.millis), LocalDate.parse(d.date).atStartOfDay(SEOUL).toInstant().toString())));
        boolean active = session != null && now < session.lastSeenAt + NFC_LEASE_MS;
        return new PointsView(total(user, projected), history.stream().sorted(Comparator.comparing(PointHistory::createdAt).reversed()).limit(20).toList(),
            new NfcView(active, session == null ? user.petName : session.petName, "SIM-" + user.id.substring(0, 8), date, today, nfcPoints(today), now,
                active ? session.lastSeenAt + NFC_LEASE_MS : now, nextMidnight(now), active ? session.startedAt : 0));
    }
    public synchronized PointsView nfcProximity(String token, boolean enabled) {
        var user = require(token);
        if (enabled && user.petName.isBlank()) throw bad("이웃 프로필에 반려동물 이름을 먼저 등록해주세요.");
        long now = clock.millis();
        return write(() -> {
            settleNfc(user, now);
            if (!enabled) db.nfcSessions.removeIf(s -> s.userId.equals(user.id));
            else if (nfcSession(user) == null) db.nfcSessions.add(new NfcSession(user.id, user.petName, now, now, now));
            return points(token);
        });
    }
    public synchronized PointsView nfcHeartbeat(String token) {
        var user = require(token); long now = clock.millis();
        return write(() -> { settleNfc(user, now); return points(token); });
    }
    public synchronized SharedTripView createShare(String token, ShareInput input) {
        var user = require(token);
        if (input.stops == null || input.stops.isEmpty() || input.stops.size() > 8) throw bad("공유할 장소는 1~8곳으로 선택해주세요.");
        var stops = new ArrayList<SharedPlace>();
        var seen = new HashSet<String>();
        for (var p : input.stops) {
            if (p == null) throw bad("공유할 장소를 확인해주세요.");
            String placeId = text(p.id, 1, 80, "장소"), name = text(p.name, 1, 200, "장소 이름"), address = text(p.address, 0, 300, "주소");
            if (placeId.startsWith("demo-") || !seen.add(placeId) || !Set.of("attraction", "culture", "festival", "course", "leisure", "stay", "shopping", "restaurant", "care").contains(Objects.requireNonNullElse(p.category, ""))) throw bad("공유할 장소를 확인해주세요.");
            double lat, lon;
            try { lat = Double.parseDouble(p.latitude); lon = Double.parseDouble(p.longitude); }
            catch (RuntimeException ex) { throw bad("장소의 위치를 확인해주세요."); }
            if (!Double.isFinite(lat) || !Double.isFinite(lon) || lat < 32 || lat > 39.5 || lon < 124 || lon > 132) throw bad("장소의 위치를 확인해주세요.");
            stops.add(new SharedPlace(placeId, name, address, p.category, Double.toString(lat), Double.toString(lon)));
        }
        // Place identity and order define a share; cosmetic edits cannot earn extra rewards.
        String fingerprint = hash(mapper.writeValueAsString(stops.stream().map(SharedPlace::id).toList()));
        var existing = db.shares.stream().filter(s -> s.ownerId.equals(user.id) && s.fingerprint.equals(fingerprint)).findFirst().orElse(null);
        if (existing != null) return new SharedTripView(existing.id, existing.stops);
        return write(() -> {
            var share = new SharedTrip(id(), user.id, fingerprint, List.copyOf(stops)); db.shares.add(share);
            return new SharedTripView(share.id, share.stops);
        });
    }
    private SharedTrip findShare(String id) {
        return db.shares.stream().filter(s -> s.id.equals(id)).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "공유한 코스를 찾을 수 없어요."));
    }
    public synchronized SharedTripView sharedTrip(String id) {
        var share = findShare(id); return new SharedTripView(share.id, share.stops);
    }
    public synchronized ShareReward completeShare(String token, String id) {
        var user = require(token); var share = findShare(id);
        if (!share.ownerId.equals(user.id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "내 코스의 공유만 적립할 수 있어요.");
        return write(() -> { int awarded = award(user, "share", share.fingerprint, 10); return new ShareReward(total(user), awarded); });
    }
}
