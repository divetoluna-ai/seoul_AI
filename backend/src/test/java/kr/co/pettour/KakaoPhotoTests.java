package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicInteger;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;

class KakaoPhotoTests {
    @TempDir Path directory;
    private final Place place = new Place("csv-01234567890123456789", "테스트 카페", "restaurant", "서울특별시 종로구 인사동길 11", "", "02-123-4567", "126.986787", "37.57182943", "20261114", "xlsx");
    private final KakaoPhotoService.Match match = new KakaoPhotoService.Match("123456", "테스트 카페", "서울 종로구 인사동길 11", "서울 종로구 인사동 1", "126.986787", "37.57182943");
    private static final String IMAGE = "https://img1.kakaocdn.net/cthumb/local/C800x400.q50/?fname=http%3A%2F%2Ft1.kakaocdn.net%2Flocal%2FkakaomapPhoto%2Freview%2Fexample%3Foriginal";
    private static byte[] jpeg() { return new byte[] {(byte)255, (byte)216, (byte)255, 0, 0, 0, 0, 0, 0, 0, 0, 0}; }
    private static String localImage(String url) { return "/api/places/photos/" + KakaoPhotoFiles.key(url); }
    private String gallery(String category, String image) {
        return "{\"request\":{\"tag\":\"" + category + "\",\"page\":1},\"place_name\":\"테스트 카페\",\"photos\":[{\"confirm_id\":\"123456\",\"url\":\"" + image + "\"}]}";
    }
    private String html(String image) {
        return "<meta property='og:url' content='https://place.map.kakao.com/123456'>" +
            "<meta property='og:title' content='테스트 카페'><meta property='og:description' content='서울 종로구 인사동 1 2층'>" +
            "<meta property='og:image' content='" + image + "'>";
    }
    private KakaoPhotoService service(KakaoPhotoService.PageFetcher fetcher) {
        return service(fetcher, (id, category) -> gallery(category, IMAGE));
    }
    private KakaoPhotoService service(KakaoPhotoService.PageFetcher fetcher, KakaoPhotoService.GalleryFetcher gallery) {
        return new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("photos.json"), true, 0, fetcher,
            new KakaoPhotoFiles(directory.resolve("images"), url -> jpeg()), gallery);
    }
    @Test void collectsPublicPhotoPersistsAndRetainsOriginalBusinessData() throws Exception {
        var calls = new AtomicInteger();
        var service = service(id -> { calls.incrementAndGet(); assertEquals("123456", id); return html(IMAGE); });
        var result = service.collect(place, match);
        assertEquals("collected", result.status());
        assertEquals(localImage(IMAGE), result.place().image());
        assertEquals(place.source(), result.place().source());
        assertEquals(place.address(), result.place().address());
        assertEquals(place.latitude(), result.place().latitude());
        assertEquals("kakao", result.place().imageSource());
        assertEquals("https://place.map.kakao.com/123456", result.place().imagePage());
        assertFalse(result.place().imageCollectedAt().isBlank());
        assertEquals("available", service.collect(place, match).status());
        assertEquals(1, calls.get());
        var restarted = service(id -> { fail("A restart must reuse the disk cache"); return ""; });
        assertEquals(localImage(IMAGE), restarted.cached(place).image());
        var relocated = new Place(place.id(), place.name(), place.category(), "부산광역시 다른 주소", "", "", "", "", "", "xlsx");
        assertTrue(restarted.cached(relocated).image().isBlank());
    }
    @Test void servesVerifiedFilesAndRejectsUnknownKeys() throws Exception {
        var collector = service(id -> html(IMAGE));
        collector.collect(place, match);
        var asset = collector.asset(KakaoPhotoFiles.key(IMAGE));
        assertEquals("image/jpeg", asset.contentType());
        assertArrayEquals(jpeg(), asset.bytes());
        assertThrows(java.io.IOException.class, () -> collector.asset("../photos.json"));
        assertThrows(java.io.IOException.class, () -> collector.asset("0".repeat(64)));
        assertArrayEquals(jpeg(), service(id -> "").asset(KakaoPhotoFiles.key(IMAGE)).bytes());
    }
    @Test void failedImageDownloadNeverBecomesAnAvailablePhoto() {
        var collector = new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("photos.json"), true, 0,
            id -> html(IMAGE), new KakaoPhotoFiles(directory.resolve("images"), url -> { throw new java.io.IOException("offline"); }),
            (id, category) -> gallery(category, IMAGE));
        assertEquals("unavailable", collector.collect(place, match).status());
        assertTrue(collector.cached(place).image().isBlank());
    }
    @Test void urlOnlyCacheIsDownloadedOnceOnFirstDisplay() throws Exception {
        service(id -> html(IMAGE)).collect(place, match);
        var count = new AtomicInteger();
        var migrated = new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("photos.json"), true, 0,
            id -> { fail("No new page fetch for a cached photo"); return ""; },
            new KakaoPhotoFiles(directory.resolve("migrated-images"), url -> { count.incrementAndGet(); return jpeg(); }),
            (id, category) -> { fail("No new gallery fetch for a cached photo"); return ""; });
        migrated.asset(KakaoPhotoFiles.key(IMAGE)); migrated.asset(KakaoPhotoFiles.key(IMAGE));
        assertEquals(1, count.get());
    }
    @Test void olderCoverCacheIsServedForSavedPlacesButReplacedInCatalog() throws Exception {
        service(id -> html(IMAGE)).collect(place, match);
        var path = directory.resolve("photos.json");
        Files.writeString(path, Files.readString(path).replace(",\"category\":\"INDOOR\"", ""));
        var upgraded = service(id -> html(IMAGE));
        assertTrue(upgraded.cached(place).image().isBlank());
        assertEquals("image/jpeg", upgraded.asset(KakaoPhotoFiles.key(IMAGE)).contentType());
        assertEquals("collected", upgraded.collect(place, match).status());
        assertEquals("INDOOR", JsonMapper.builder().build().readTree(Files.readString(path)).get(0).path("category").asString());
    }
    @Test void wrongBranchWrongTitleWrongPageAndMapFallbackNeverBecomeBusinessPhotos() {
        var otherBranch = new KakaoPhotoService.Match("123457", match.name(), "부산 해운대구 다른길 20", "", "129.1", "35.1");
        assertEquals("unmatched", service(id -> { fail("Do not crawl an unmatched business"); return ""; }).collect(place, otherBranch).status());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("테스트 카페", "다른 카페")).isEmpty());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("com/123456", "com/987654")).isEmpty());
        assertTrue(KakaoPhotoService.parse(place, match, html("http://staticmap.kakao.com/staticmap/og?type=place")).isPresent());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("서울 종로구 인사동 1 2층", "부산 다른 주소")).isEmpty());
        assertFalse(KakaoPhotoService.validImage("https://evil.test/local/kakaomapPhoto/1.jpg"));
        assertFalse(KakaoPhotoService.validImage("https://img1.kakaocdn.net/local/kakaomapPhoto/@evil.test".replace("kakaocdn.net/", "kakaocdn.net.evil.test/")));
        assertFalse(KakaoPhotoService.validImage("https://t1.kakaocdn.net/logo.png"));
    }
    @Test void missingPhotosAndNetworkFailuresAreNegativelyCached() {
        var count = new AtomicInteger();
        var noPhoto = service(id -> { count.incrementAndGet(); return html("https://t1.kakaocdn.net/logo.png"); },
            (id, category) -> gallery(category, "https://t1.kakaocdn.net/logo.png"));
        assertEquals("unavailable", noPhoto.collect(place, match).status());
        assertEquals("unavailable", noPhoto.collect(place, match).status());
        assertEquals(1, count.get());
        var unavailable = service(id -> { throw new java.io.IOException("403"); });
        assertEquals("unavailable", unavailable.collect(place, match).status());
        assertTrue(unavailable.cached(place).image().isBlank());
    }
    @Test void prefersInteriorThenExteriorAndNeverUsesUnclassifiedCover() {
        String indoor = "https://t1.kakaocdn.net/local/kakaomapPhoto/review/indoor.jpg";
        var calls = new java.util.ArrayList<String>();
        var exterior = service(id -> html("https://t1.kakaocdn.net/logo.png"), (id, category) -> {
            calls.add(category); return gallery(category, category.equals("OUTDOOR") ? IMAGE : indoor);
        });
        assertEquals(localImage(indoor), exterior.collect(place, match).place().image());
        assertEquals(java.util.List.of("INDOOR"), calls);
        assertTrue(Files.exists(directory.resolve("photos.json")));
        var interior = new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("interior.json"), true, 0,
            id -> html(IMAGE), new KakaoPhotoFiles(directory.resolve("interior-images"), url -> jpeg()),
            (id, category) -> gallery(category, category.equals("INDOOR") ? "https://t1.kakaocdn.net/logo.png" : IMAGE));
        assertEquals(localImage(IMAGE), interior.collect(place, match).place().image());
    }
    @Test void mismatchedGalleryCannotProvideAnImage() {
        var collector = service(id -> html(IMAGE), (id, category) ->
            gallery(category, IMAGE).replace("\"confirm_id\":\"123456\"", "\"confirm_id\":\"987654\""));
        assertEquals("unavailable", collector.collect(place, match).status());
        assertTrue(collector.cached(place).image().isBlank());
    }
    @Test void existingOfficialPhotoIsKeptAndUntrustedPlaceIdsNeverReachNetwork() {
        var collector = service(id -> { fail("No request expected"); return ""; });
        var official = new Place(place.id(), place.name(), place.category(), place.address(), "https://example.com/official.jpg", "", "", "", "", "csv", "tourapi");
        assertEquals(official, collector.collect(official, match).place());
        var malicious = new KakaoPhotoService.Match("../123?url=https://evil.test", match.name(), match.roadAddress(), "", "", "");
        assertEquals("unmatched", collector.collect(place, malicious).status());
    }
    @Test void corruptOrExpiredCacheDoesNotPreventStartupOrShowStalePhoto() throws Exception {
        Files.writeString(directory.resolve("photos.json"), "not json");
        var collector = service(id -> html(IMAGE));
        assertTrue(collector.cached(place).image().isBlank());
        collector.collect(place, match);
        String cache = Files.readString(directory.resolve("photos.json")).replaceAll("\"collectedAt\":\"[^\"]+\"", "\"collectedAt\":\"2020-01-01T00:00:00Z\"");
        Files.writeString(directory.resolve("photos.json"), cache);
        assertTrue(service(id -> "").cached(place).image().isBlank());
    }
    @Test void ownerAndProviderPhotoPathsAreAcceptedWhileLogosRemainExcluded() {
        for (String path : java.util.List.of("mystore/85ED522073FB479E8787BF325B2EE183", "fiy_reboot/place/3AAD78A77FDB4FF5B6E34067738E38FF")) {
            String direct = "https://t1.kakaocdn.net/" + path;
            String thumbnail = "https://img1.kakaocdn.net/cthumb/local/C800x400.q50/?fname=" + java.net.URLEncoder.encode(direct, java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(KakaoPhotoService.validImage(direct));
            assertTrue(KakaoPhotoService.validImage(thumbnail));
            assertEquals(thumbnail, KakaoPhotoService.parse(place, match, html(thumbnail)).orElseThrow().image());
        }
        assertFalse(KakaoPhotoService.validImage("https://t1.kakaocdn.net/mystore/logo.png"));
        assertFalse(KakaoPhotoService.validImage("https://t1.kakaocdn.net/fiy_reboot/place/map.png"));
        assertFalse(KakaoPhotoService.validImage("https://evil.test/mystore/85ED522073FB479E8787BF325B2EE183"));
    }
}
