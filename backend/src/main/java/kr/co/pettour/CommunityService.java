package kr.co.pettour;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
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
    public record CourseInput(String title, String content, String region, List<StopInput> stops) {}
    public record Course(String id, String authorId, String title, String content, String region,
                         List<Place> stops, String createdAt, String updatedAt, Set<String> likes) {}
    public record Snapshot(List<Account> accounts, List<Course> courses) {}
    public record PublicCourse(String id, String title, String content, String region, List<Place> stops, String createdAt, String updatedAt) {}
    public record CourseView(PublicCourse course, Profile author, int likeCount, boolean mine, boolean liked) {}
    public record Feed(List<CourseView> items, long total, int page, int pageSize) {}
    private final ObjectMapper mapper;
    private final Path file;
    private final CombinedPlaceService catalog;
    private Snapshot db;

    public CommunityService(ObjectMapper mapper, CombinedPlaceService catalog,
                            @Value("${community.store:./data/course-community.json}") String filename) throws java.io.IOException {
        this.mapper = mapper; this.catalog = catalog;
        Path requested = Path.of(filename).toAbsolutePath();
        // Older installations may explicitly configure the old board file. Preserve it untouched.
        if (Files.exists(requested) && mapper.readTree(Files.readString(requested)).has("posts"))
            requested = requested.resolveSibling("course-community.json");
        this.file = requested;
        db = Files.exists(file) ? mapper.readValue(Files.readString(file), Snapshot.class)
            : new Snapshot(new ArrayList<>(), new ArrayList<>());
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
        return new CourseView(new PublicCourse(p.id, p.title, p.content, p.region, p.stops, p.createdAt, p.updatedAt), author(p.authorId),
            p.likes.size(), user != null && p.authorId.equals(user.id), user != null && p.likes.contains(user.id));
    }
    public synchronized Feed feed(String token, String region, String keyword, String sort, int page, boolean mine) {
        if (!Set.of("recent", "popular").contains(sort) || page < 1 || page > 10000 || keyword.length() > 60) throw bad("검색 조건을 확인해주세요.");
        if (!region.isEmpty()) region(region);
        var user = mine ? require(token) : me(token);
        String q = CombinedPlaceService.normalize(keyword);
        Comparator<Course> byRecent = Comparator.comparing(Course::createdAt).reversed().thenComparing(Course::id);
        var results = db.courses.stream().filter(p -> region.isEmpty() || p.region.equals(region))
            .filter(p -> !mine || p.authorId.equals(user.id))
            .filter(p -> CombinedPlaceService.normalize(p.title + " " + p.content + " " + p.stops.stream().map(s -> s.name()+" "+s.address()).reduce("", (a,b) -> a+" "+b)).contains(q))
            .sorted(sort.equals("popular") ? Comparator.<Course>comparingInt(p -> p.likes.size()).reversed().thenComparing(byRecent) : byRecent).toList();
        return new Feed(results.stream().skip((long)(page - 1) * 12).limit(12).map(p -> view(p, user)).toList(), results.size(), page, 12);
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
        var course = new Course(id(), user.id, title, content, input.region, stops, time, time, new HashSet<>());
        return write(() -> { db.courses.add(course); return view(course, user); });
    }
    public synchronized CourseView update(String token, String id, CourseInput input) {
        var user = require(token); var old = find(id); own(old, user);
        String title = text(input.title, 2, 80, "코스 이름"), content = text(input.content, 5, 5000, "코스 소개");
        region(input.region); var stops = stops(input.stops);
        var updated = new Course(old.id, old.authorId, title, content, input.region, stops, old.createdAt, now(), old.likes);
        return write(() -> { db.courses.set(db.courses.indexOf(old), updated); return view(updated, user); });
    }
    public synchronized CourseView like(String token, String id, boolean liked) {
        var user = require(token); var course = find(id);
        return write(() -> { if (liked) course.likes.add(user.id); else course.likes.remove(user.id); return view(course, user); });
    }
    public synchronized void delete(String token, String id) {
        var user = require(token); var course = find(id); own(course, user);
        write(() -> { db.courses.remove(course); return true; });
    }
}
