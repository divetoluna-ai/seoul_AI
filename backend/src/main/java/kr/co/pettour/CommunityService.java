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

/** Small, single-process community store. Writes replace the snapshot atomically. */
@Service
public class CommunityService {
    public record Profile(String id, String nickname, String petName, String region, String district) {}
    public record Account(String tokenHash, Profile profile) {}
    public record ProfileInput(String nickname, String petName, String region, String district) {}
    public record PostInput(String category, String title, String content, String region, String district,
                            String tradeType, Long price, String image, String meetingAt, String meetingPlace, Integer capacity) {}
    public record Post(String id, String authorId, String category, String title, String content, String region,
                       String district, String tradeType, Long price, String image, String meetingAt,
                       String meetingPlace, int capacity, String status, String createdAt, Set<String> likes, Set<String> participants) {}
    public record Comment(String id, String postId, String authorId, String content, String createdAt) {}
    public record Conversation(String id, String postId, String starterId, String ownerId, String createdAt) {}
    public record Message(String id, String conversationId, String authorId, String content, String createdAt) {}
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
    public record Snapshot(List<Account> accounts, List<Post> posts, List<Comment> comments,
                           List<Conversation> conversations, List<Message> messages,
                           List<PointEntry> points, List<SharedTrip> shares,
                           List<NfcDay> nfcDays, List<NfcSession> nfcSessions) {
        public Snapshot {
            // Older snapshots have no points or shared trips.
            points = points == null ? new ArrayList<>() : points;
            shares = shares == null ? new ArrayList<>() : shares;
            nfcDays = nfcDays == null ? new ArrayList<>() : nfcDays;
            nfcSessions = nfcSessions == null ? new ArrayList<>() : nfcSessions;
        }
    }
    public record PostView(Post post, Profile author, int commentCount, int likeCount, int participantCount, boolean mine, boolean liked, boolean joined) {}
    public record CommentView(Comment comment, Profile author, boolean mine) {}
    public record DetailView(PostView item, List<CommentView> comments) {}
    public record Feed(List<PostView> items, long total, int page, int pageSize) {}
    public record ConversationView(String id, String postId, String title, Profile neighbor, String lastMessage, String updatedAt) {}
    public record MessageView(Message message, boolean mine) {}
    public record ConversationDetail(ConversationView conversation, List<MessageView> messages) {}
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
                            @Value("${community.store:./data/community.json}") String filename) throws java.io.IOException {
        this(mapper, catalog, filename, Clock.systemUTC());
    }
    CommunityService(ObjectMapper mapper, CombinedPlaceService catalog, String filename, Clock clock) throws java.io.IOException {
        this.mapper = mapper; this.catalog = catalog; this.file = Path.of(filename).toAbsolutePath(); this.clock = clock;
        db = Files.exists(file) ? mapper.readValue(Files.readString(file), Snapshot.class)
            : new Snapshot(new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>());
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
        if (token == null || token.length() > 100) return null;
        return db.accounts.stream().filter(a -> a.tokenHash.equals(hash(token))).map(Account::profile).findFirst().orElse(null);
    }
    private Profile require(String token) {
        var p = me(token);
        if (p == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "먼저 이웃 프로필을 만들어주세요.");
        return p;
    }
    private Profile author(String id) { return db.accounts.stream().map(Account::profile).filter(p -> p.id.equals(id)).findFirst().orElseThrow(); }
    private void location(String region, String district) {
        if (TourService.REGIONS.stream().noneMatch(r -> r.code().equals(region))) throw bad("지역을 선택해주세요.");
        if (!district.isEmpty() && catalog.districts(region).stream().noneMatch(d -> d.name().equals(district))) throw bad("선택한 지역의 시·군·구를 확인해주세요.");
    }
    private <T> T write(Supplier<T> change) {
        var backup = mapper.writeValueAsString(db);
        try {
            T result = change.get();
            Files.createDirectories(file.getParent());
            Path temp = Files.createTempFile(file.getParent(), "community-", ".tmp");
            try {
                Files.writeString(temp, mapper.writeValueAsString(db));
                try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException ex) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
            } finally { Files.deleteIfExists(temp); }
            return result;
        } catch (Exception ex) {
            db = mapper.readValue(backup, Snapshot.class);
            if (ex instanceof ResponseStatusException status) throw status;
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
    }
    public synchronized Profile saveProfile(String token, ProfileInput input) {
        String nickname = text(input.nickname, 2, 16, "닉네임"), pet = text(input.petName, 0, 20, "반려동물 이름");
        String district = text(input.district, 0, 40, "동네"); location(input.region, district);
        var existing = me(token);
        if (token == null || token.length() > 100) throw bad("프로필 세션을 확인해주세요.");
        if (db.accounts.stream().map(Account::profile).anyMatch(p -> p.nickname.equalsIgnoreCase(nickname) && (existing == null || !p.id.equals(existing.id))))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 닉네임이에요.");
        Profile profile = new Profile(existing == null ? id() : existing.id, nickname, pet, input.region, district);
        return write(() -> { db.accounts.removeIf(a -> a.profile.id.equals(profile.id)); db.accounts.add(new Account(hash(token), profile)); return profile; });
    }
    private Post findPost(String id) { return db.posts.stream().filter(p -> p.id.equals(id)).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "삭제되었거나 존재하지 않는 글이에요.")); }
    private void own(Post post, Profile user) { if (!post.authorId.equals(user.id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "작성자만 변경할 수 있어요."); }
    private PostView view(Post p, Profile user, boolean full) {
        // Lists use a short excerpt; attached images are shown as card thumbnails.
        var listed = full ? p : new Post(p.id, p.authorId, p.category, p.title, p.content.substring(0, Math.min(160, p.content.length())), p.region,
            p.district, p.tradeType, p.price, p.image, p.meetingAt, p.meetingPlace, p.capacity, p.status, p.createdAt, Set.of(), Set.of());
        // Only counts and current user's flags are public, never other users' membership IDs.
        var publicPost = new Post(listed.id, "", listed.category, listed.title, listed.content, listed.region, listed.district, listed.tradeType,
            listed.price, listed.image, listed.meetingAt, listed.meetingPlace, listed.capacity, listed.status, listed.createdAt,
            Set.of(), Set.of());
        return new PostView(publicPost, author(p.authorId), (int) db.comments.stream().filter(c -> c.postId.equals(p.id)).count(),
            p.likes.size(), p.participants.size(),
            user != null && p.authorId.equals(user.id), user != null && p.likes.contains(user.id), user != null && p.participants.contains(user.id));
    }
    public synchronized Feed feed(String token, String category, String region, String district, String keyword, String sort, int page, boolean mine) {
        if (!Set.of("all", "info", "walk", "market").contains(category) || !Set.of("recent", "popular").contains(sort) || page < 1 || page > 10000 || keyword.length() > 60) throw bad("검색 조건을 확인해주세요.");
        if (!region.isEmpty()) location(region, district);
        var user = mine ? require(token) : me(token);
        String q = keyword.strip().toLowerCase(Locale.ROOT);
        var results = db.posts.stream().filter(p -> category.equals("all") || p.category.equals(category))
            .filter(p -> region.isEmpty() || p.region.equals(region)).filter(p -> district.isEmpty() || p.district.equals(district))
            .filter(p -> !mine || p.authorId.equals(user.id)).filter(p -> (p.title + " " + p.content).toLowerCase(Locale.ROOT).contains(q))
            .sorted(sort.equals("popular") ? Comparator.<Post>comparingInt(p -> p.likes.size()).reversed().thenComparing(Post::createdAt, Comparator.reverseOrder()) : Comparator.comparing(Post::createdAt).reversed()).toList();
        return new Feed(results.stream().skip((long)(page - 1) * 12).limit(12).map(p -> view(p, user, false)).toList(), results.size(), page, 12);
    }
    public synchronized DetailView detail(String token, String id) {
        Post p = findPost(id); Profile user = me(token);
        return new DetailView(view(p, user, true), db.comments.stream().filter(c -> c.postId.equals(id))
            .map(c -> new CommentView(c, author(c.authorId), user != null && c.authorId.equals(user.id))).toList());
    }
    public synchronized DetailView create(String token, PostInput input) {
        var user = require(token);
        if (!Set.of("info", "walk", "market").contains(Objects.requireNonNullElse(input.category, ""))) throw bad("글 종류를 선택해주세요.");
        String title = text(input.title, 2, 80, "제목"), content = text(input.content, 5, 5000, "내용");
        String district = text(input.district, 0, 40, "동네"); location(input.region, district);
        String image = Objects.requireNonNullElse(input.image, "");
        if (!image.isEmpty() && (image.length() > 684000 || !image.matches("data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+"))) throw bad("사진은 500KB 이하의 JPG·PNG·WebP 파일로 첨부해주세요.");
        String trade = "", meetingAt = "", meetingPlace = ""; Long price = null; int capacity = 0;
        if (input.category.equals("market")) {
            trade = Objects.requireNonNullElse(input.tradeType, "");
            if (!Set.of("sale", "share").contains(trade)) throw bad("판매 또는 나눔을 선택해주세요.");
            price = trade.equals("share") ? 0 : input.price;
            if (price == null || price < 0 || price > 100000000) throw bad("가격은 0~100,000,000원으로 입력해주세요.");
        }
        if (input.category.equals("walk")) {
            meetingPlace = text(input.meetingPlace, 2, 80, "만날 장소");
            try { var date = Instant.parse(input.meetingAt); if (!date.isAfter(Instant.now())) throw bad("앞으로 만날 시간을 선택해주세요."); meetingAt = date.toString(); }
            catch (java.time.DateTimeException | NullPointerException ex) { throw bad("모임 날짜와 시간을 선택해주세요."); }
            capacity = input.capacity == null ? 4 : input.capacity;
            if (capacity < 2 || capacity > 30) throw bad("모임 정원은 2~30명으로 정해주세요.");
        }
        Post post = new Post(id(), user.id, input.category, title, content, input.region, district, trade, price, image, meetingAt, meetingPlace, capacity,
            "open", now(), new HashSet<>(), new HashSet<>(input.category.equals("walk") ? Set.of(user.id) : Set.of()));
        return write(() -> { db.posts.add(post); return detail(token, post.id); });
    }
    public synchronized DetailView like(String token, String id, boolean liked) {
        var user = require(token); var post = findPost(id);
        return write(() -> {
            if (liked && post.likes.add(user.id)) award(user, "like", id, 1);
            else if (!liked) post.likes.remove(user.id);
            return detail(token, id);
        });
    }
    public synchronized DetailView join(String token, String id, boolean joined) {
        var user = require(token); var post = findPost(id);
        if (!post.category.equals("walk") || post.authorId.equals(user.id)) throw bad("참여할 수 없는 모임이에요.");
        if (joined && (!post.status.equals("open") || !Instant.parse(post.meetingAt).isAfter(Instant.now()) || (!post.participants.contains(user.id) && post.participants.size() >= post.capacity)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "모집이 마감되었거나 정원이 찬 모임이에요.");
        return write(() -> { if (joined) post.participants.add(user.id); else post.participants.remove(user.id); return detail(token, id); });
    }
    public synchronized DetailView status(String token, String id, String status) {
        var user = require(token); var p = findPost(id); own(p, user);
        if (p.category.equals("info") || !Set.of("open", "reserved", "done").contains(Objects.requireNonNullElse(status, "")) || (p.category.equals("walk") && status.equals("reserved"))) throw bad("변경할 상태를 확인해주세요.");
        return write(() -> { db.posts.set(db.posts.indexOf(p), new Post(p.id, p.authorId, p.category, p.title, p.content, p.region, p.district,
            p.tradeType, p.price, p.image, p.meetingAt, p.meetingPlace, p.capacity, status, p.createdAt, p.likes, p.participants)); return detail(token, id); });
    }
    public synchronized void deletePost(String token, String id) {
        var user = require(token); var p = findPost(id); own(p, user);
        write(() -> { db.posts.remove(p); db.comments.removeIf(c -> c.postId.equals(id)); return true; });
    }
    public synchronized DetailView comment(String token, String id, String content) {
        var user = require(token); findPost(id); String value = text(content, 1, 1000, "댓글");
        return write(() -> {
            var comment = new Comment(id(), id, user.id, value, now());
            db.comments.add(comment); award(user, "comment", comment.id, 5);
            return detail(token, id);
        });
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
    public synchronized DetailView deleteComment(String token, String id, String commentId) {
        var user = require(token); findPost(id);
        var c = db.comments.stream().filter(v -> v.id.equals(commentId) && v.postId.equals(id)).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없어요."));
        if (!c.authorId.equals(user.id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "내 댓글만 삭제할 수 있어요.");
        return write(() -> { db.comments.remove(c); return detail(token, id); });
    }
    private Conversation conversation(Profile user, String id) {
        var c = db.conversations.stream().filter(v -> v.id.equals(id)).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "대화를 찾을 수 없어요."));
        if (!c.ownerId.equals(user.id) && !c.starterId.equals(user.id)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "대화 참여자만 확인할 수 있어요.");
        return c;
    }
    private ConversationView conversationView(Conversation c, Profile user) {
        var post = db.posts.stream().filter(p -> p.id.equals(c.postId)).findFirst().orElse(null);
        var messages = db.messages.stream().filter(m -> m.conversationId.equals(c.id)).toList();
        var last = messages.isEmpty() ? null : messages.getLast();
        return new ConversationView(c.id, c.postId, post == null ? "삭제된 게시글" : post.title, author(c.ownerId.equals(user.id) ? c.starterId : c.ownerId), last == null ? "인사를 나눠보세요." : last.content, last == null ? c.createdAt : last.createdAt);
    }
    public synchronized List<ConversationView> conversations(String token) {
        var user = require(token);
        return db.conversations.stream().filter(c -> c.ownerId.equals(user.id) || c.starterId.equals(user.id)).map(c -> conversationView(c, user)).sorted(Comparator.comparing(ConversationView::updatedAt).reversed()).toList();
    }
    public synchronized ConversationDetail messages(String token, String id) {
        var user = require(token); var c = conversation(user, id);
        return new ConversationDetail(conversationView(c, user), db.messages.stream().filter(m -> m.conversationId.equals(id)).map(m -> new MessageView(m, m.authorId.equals(user.id))).toList());
    }
    public synchronized ConversationDetail startConversation(String token, String postId) {
        var user = require(token); var p = findPost(postId);
        if (p.authorId.equals(user.id)) throw bad("내 글에는 대화를 시작할 수 없어요.");
        var existing = db.conversations.stream().filter(c -> c.postId.equals(postId) && c.starterId.equals(user.id)).findFirst().orElse(null);
        if (existing != null) return messages(token, existing.id);
        return write(() -> { var c = new Conversation(id(), postId, user.id, p.authorId, now()); db.conversations.add(c); return messages(token, c.id); });
    }
    public synchronized ConversationDetail send(String token, String id, String content) {
        var user = require(token); conversation(user, id); String value = text(content, 1, 1000, "메시지");
        return write(() -> { db.messages.add(new Message(id(), id, user.id, value, now())); return messages(token, id); });
    }
}
