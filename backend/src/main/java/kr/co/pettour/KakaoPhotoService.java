package kr.co.pettour;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static kr.co.pettour.Models.*;

/** Collects one verified photo from a public Kakao place page. */
@Service
public class KakaoPhotoService {
    public record Match(String id, String name, String roadAddress, String lotAddress, String longitude, String latitude) {}
    public record Result(String status, Place place) {}
    public record Photo(String placeId, String fingerprint, String image, String page, String collectedAt, String category) {}
    @FunctionalInterface interface PageFetcher { String fetch(String id) throws IOException; }
    @FunctionalInterface interface GalleryFetcher { String fetch(String id, String category) throws IOException; }
    private static final Duration TTL = Duration.ofDays(7);
    private final Map<String, Photo> photos = new ConcurrentHashMap<>();
    private final Map<String, Instant> misses = new ConcurrentHashMap<>();
    private final ObjectMapper mapper;
    private final Path file;
    private final KakaoPhotoFiles files;
    private final boolean enabled;
    private final long interval;
    private final PageFetcher fetcher;
    private final GalleryFetcher gallery;
    private long nextRequest;

    @Autowired
    public KakaoPhotoService(ObjectMapper mapper,
        @Value("${kakao.photos.cache-file:./data/kakao-photos.json}") String file,
        @Value("${kakao.photos.enabled:true}") boolean enabled,
        @Value("${kakao.photos.min-interval-ms:1100}") long interval) {
        this(mapper, Path.of(file), enabled, interval, id -> {
            var response = Jsoup.connect("https://place.map.kakao.com/" + id)
                .userAgent("PetTourPhotoCollector/1.0")
                .timeout(8000).maxBodySize(524288).followRedirects(false).ignoreHttpErrors(true).execute();
            if (response.statusCode() != 200) throw new IOException("Place page unavailable");
            return response.body();
        }, KakaoPhotoService::fetchGallery);
    }
    private static String fetchGallery(String id, String category) throws IOException {
        var response = Jsoup.connect("https://place.map.kakao.com/places/tab/photos/" + id + "?tag=" + category + "&page=1")
            .userAgent("PetTourPhotoCollector/1.0").referrer("https://place.map.kakao.com/" + id)
            .timeout(8000).maxBodySize(524288).followRedirects(false).ignoreHttpErrors(true).ignoreContentType(true).execute();
        if (response.statusCode() != 200) throw new IOException("Place gallery unavailable");
        return response.body();
    }
    KakaoPhotoService(ObjectMapper mapper, Path file, boolean enabled, long interval, PageFetcher fetcher) {
        this(mapper, file, enabled, interval, fetcher, KakaoPhotoService::fetchGallery);
    }
    KakaoPhotoService(ObjectMapper mapper, Path file, boolean enabled, long interval, PageFetcher fetcher, GalleryFetcher gallery) {
        this(mapper, file, enabled, interval, fetcher, new KakaoPhotoFiles(file.toAbsolutePath().resolveSibling("kakao-photo-files")), gallery);
    }
    KakaoPhotoService(ObjectMapper mapper, Path file, boolean enabled, long interval, PageFetcher fetcher, KakaoPhotoFiles files) {
        this(mapper, file, enabled, interval, fetcher, files, KakaoPhotoService::fetchGallery);
    }
    KakaoPhotoService(ObjectMapper mapper, Path file, boolean enabled, long interval, PageFetcher fetcher, KakaoPhotoFiles files, GalleryFetcher gallery) {
        this.gallery = gallery; this.files = files;
        this.mapper = mapper; this.file = file; this.enabled = enabled; this.interval = Math.max(0, interval); this.fetcher = fetcher;
        if (Files.exists(file)) {
            try {
                for (var p : mapper.readValue(Files.readString(file), Photo[].class)) {
                    if (p.placeId() != null && validImage(p.image()) && validPage(p.page()) && fresh(p)) photos.put(p.placeId(), p);
                }
            } catch (Exception ignored) { /* A corrupt optional cache must not prevent startup. */ }
        }
    }
    public Place cached(Place place) {
        if (!enabled || !place.image().isBlank()) return place;
        var photo = photos.get(place.id());
        return photo != null && ("OUTDOOR".equals(photo.category()) || "INDOOR".equals(photo.category())) &&
            fingerprint(place).equals(photo.fingerprint()) && fresh(photo) ? withPhoto(place, photo) : place;
    }
    boolean enabled() { return enabled; }
    public synchronized Result collect(Place place, Match match) {
        if (!enabled) return new Result("disabled", place);
        if (!place.image().isBlank()) return new Result("available", place);
        Place cached = cached(place);
        if (!cached.image().isBlank()) return new Result("available", cached);
        if (!sameBusiness(place, match)) return new Result("unmatched", place);
        String key = fingerprint(place) + ":" + match.id();
        if (misses.getOrDefault(key, Instant.MIN).isAfter(Instant.now())) return new Result("unavailable", place);
        try {
            long wait = nextRequest - System.currentTimeMillis();
            if (wait > 0) Thread.sleep(wait);
            nextRequest = System.currentTimeMillis() + interval;
            var verified = parse(place, match, fetcher.fetch(match.id()));
            if (verified.isEmpty()) {
                rememberMiss(key, Duration.ofHours(6));
                return new Result("unavailable", place);
            }
            Photo photo = null;
            for (String category : List.of("INDOOR", "OUTDOOR")) {
                try {
                    photo = galleryPhoto(place, match, verified.get().page(), category, gallery.fetch(match.id(), category));
                    if (photo != null) { files.save(photo.image()); break; }
                } catch (IOException | RuntimeException ignored) { photo = null; }
            }
            if (photo == null) { rememberMiss(key, Duration.ofHours(6)); return new Result("unavailable", place); }
            photos.put(place.id(), photo);
            try { persist(); } catch (IOException ignored) { /* The in-memory copy is still usable. */ }
            return new Result("collected", withPhoto(place, photo));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException ignored) {
            rememberMiss(key, Duration.ofMinutes(5));
        }
        return new Result("unavailable", place);
    }
    // The URL is derived from verified metadata, never from a caller-supplied remote URL.
    public synchronized KakaoPhotoFiles.Asset asset(String key) throws IOException {
        if (!enabled || key == null || !key.matches("[a-f0-9]{64}")) throw new IOException("Photo unavailable");
        var photo = photos.values().stream().filter(p -> fresh(p) && KakaoPhotoFiles.key(p.image()).equals(key))
            .findFirst().orElseThrow(() -> new IOException("Photo unavailable"));
        String missKey = "asset:" + key;
        if (misses.getOrDefault(missKey, Instant.MIN).isAfter(Instant.now())) throw new IOException("Photo unavailable");
        try {
            // Existing URL-only caches are migrated lazily when their image is displayed.
            files.save(photo.image());
            return files.read(photo.image());
        } catch (IOException ex) {
            rememberMiss(missKey, Duration.ofMinutes(5));
            throw ex;
        }
    }
    private void rememberMiss(String key, Duration duration) {
        if (misses.size() > 2000) misses.entrySet().removeIf(e -> e.getValue().isBefore(Instant.now()));
        if (misses.size() < 5000) misses.put(key, Instant.now().plus(duration));
    }
    static Optional<Photo> parse(Place place, Match match, String html) {
        if (!sameBusiness(place, match)) return Optional.empty();
        Document document = Jsoup.parse(html);
        String page = meta(document, "og:url");
        if (!page.equals("https://place.map.kakao.com/" + match.id()) ||
            !name(meta(document, "og:title")).equals(name(match.name()))) return Optional.empty();
        String description = address(meta(document, "og:description"));
        boolean addressMatch = (!match.lotAddress().isBlank() && description.startsWith(address(match.lotAddress()))) ||
            (!match.roadAddress().isBlank() && description.startsWith(address(match.roadAddress())));
        // Kakao may expose the lot address in description and road address in search results.
        if (!addressMatch && !mapCoordinateMatches(document, match)) return Optional.empty();
        String image = meta(document, "og:image");
        if (image.startsWith("//")) image = "https:" + image;
        return Optional.of(new Photo(place.id(), fingerprint(place), image, page, Instant.now().toString(), "UNCLASSIFIED"));
    }
    private Photo galleryPhoto(Place place, Match match, String page, String category, String json) {
        var data = mapper.readTree(json);
        if (!category.equals(data.path("request").path("tag").asString()) ||
            data.path("request").path("page").asInt() != 1 ||
            !name(data.path("place_name").asString("" )).equals(name(match.name()))) return null;
        for (var item : data.path("photos")) {
            if (!match.id().equals(item.path("confirm_id").asString())) continue;
            String image = item.path("url").asString("");
            if (image.startsWith("http://")) image = "https://" + image.substring(7);
            if (validImage(image)) return new Photo(place.id(), fingerprint(place), image, page, Instant.now().toString(), category);
        }
        return null;
    }
    private static String meta(Document d, String key) {
        var node = d.selectFirst("meta[property=\"" + key + "\"],meta[name=\"" + key + "\"]");
        return node == null ? "" : node.attr("content").strip();
    }
    private static boolean mapCoordinateMatches(Document d, Match m) {
        try {
            URI uri = URI.create(meta(d, "twitter:image"));
            if (!"staticmap.kakao.com".equals(uri.getHost()) || uri.getRawQuery() == null) return false;
            for (String p : uri.getRawQuery().split("&")) if (p.startsWith("m=")) {
                String[] xy = URLDecoder.decode(p.substring(2), StandardCharsets.UTF_8).split(",");
                return xy.length == 2 && near(xy[0], xy[1], m.longitude(), m.latitude());
            }
        } catch (RuntimeException ignored) {}
        return false;
    }
    static boolean sameBusiness(Place p, Match m) {
        if (m == null || m.id() == null || !m.id().matches("[0-9]{1,20}") || m.name() == null ||
            m.roadAddress() == null || m.lotAddress() == null || !name(p.name()).equals(name(m.name()))) return false;
        String a = address(p.address());
        return !a.isBlank() && (a.equals(address(m.roadAddress())) || a.equals(address(m.lotAddress()))) ||
            near(p.longitude(), p.latitude(), m.longitude(), m.latitude());
    }
    private static String name(String value) {
        return CombinedPlaceService.normalize(value.replace("(주)", "").replace("㈜", "").replace("주식회사", ""));
    }
    static String address(String value) {
        String a = value.replaceAll("\\([^)]*\\)", "").strip();
        if (a.startsWith("전남광주통합특별시")) a = a.replaceFirst("전남광주통합특별시", a.matches(".* (동구|서구|남구|북구|광산구)( .*|$)") ? "광주" : "전남");
        a = a.replace("서울특별시", "서울").replace("부산광역시", "부산").replace("대구광역시", "대구")
            .replace("인천광역시", "인천").replace("광주광역시", "광주").replace("대전광역시", "대전")
            .replace("울산광역시", "울산").replace("세종특별자치시", "세종").replace("경기도", "경기")
            .replace("강원특별자치도", "강원").replace("강원도", "강원").replace("충청북도", "충북")
            .replace("충청남도", "충남").replace("전북특별자치도", "전북").replace("전라북도", "전북")
            .replace("전라남도", "전남").replace("경상북도", "경북").replace("경상남도", "경남")
            .replace("제주특별자치도", "제주");
        return CombinedPlaceService.normalize(a);
    }
    private static boolean near(String ax, String ay, String bx, String by) {
        try {
            double x = Double.parseDouble(ax), y = Double.parseDouble(ay), xx = Double.parseDouble(bx), yy = Double.parseDouble(by);
            if (!(x >= 124 && x <= 132 && xx >= 124 && xx <= 132 && y >= 32 && y <= 40 && yy >= 32 && yy <= 40)) return false;
            return Math.hypot((y-yy)*111320, (x-xx)*111320*Math.cos(Math.toRadians(y))) <= 75;
        } catch (RuntimeException ignored) { return false; }
    }
    static boolean validImage(String image) {
        try {
            URI uri = URI.create(image);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getHost() == null ||
                !uri.getHost().matches("(?:img[1-4]|t[1-4])\\.(?:kakaocdn|daumcdn)\\.net")) return false;
            String decoded = URLDecoder.decode(image, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
            return decoded.contains("/local/kakaomapphoto/") || decoded.contains("/cfile/")
                || java.util.regex.Pattern.compile("/(?:mystore|fiy_reboot/place)/[0-9a-f]{32}(?:[?&#/]|$)").matcher(decoded).find();
        } catch (RuntimeException ignored) { return false; }
    }
    private static boolean validPage(String url) { return url != null && url.matches("https://place\\.map\\.kakao\\.com/[0-9]{1,20}"); }
    private static boolean fresh(Photo p) {
        try { var t = Instant.parse(p.collectedAt()); return t.isBefore(Instant.now().plusSeconds(60)) && t.plus(TTL).isAfter(Instant.now()); }
        catch (RuntimeException ignored) { return false; }
    }
    private static String fingerprint(Place p) {
        try {
            return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest((p.id()+"|"+p.name()+"|"+p.address()).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    private static Place withPhoto(Place p, Photo photo) {
        return new Place(p.id(), p.name(), p.category(), p.address(), "/api/places/photos/" + KakaoPhotoFiles.key(photo.image()), p.phone(), p.longitude(), p.latitude(),
            p.modified(), p.source(), "kakao", photo.page(), photo.collectedAt());
    }
    private void persist() throws IOException {
        Path absolute = file.toAbsolutePath();
        Files.createDirectories(absolute.getParent());
        Path tmp = absolute.resolveSibling(absolute.getFileName() + ".tmp");
        Files.writeString(tmp, mapper.writeValueAsString(photos.values()));
        try { Files.move(tmp, absolute, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException ex) { Files.move(tmp, absolute, StandardCopyOption.REPLACE_EXISTING); }
    }
}
