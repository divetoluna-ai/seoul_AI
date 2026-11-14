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
    private String html(String image) {
        return "<meta property='og:url' content='https://place.map.kakao.com/123456'>" +
            "<meta property='og:title' content='테스트 카페'><meta property='og:description' content='서울 종로구 인사동 1 2층'>" +
            "<meta property='og:image' content='" + image + "'>";
    }
    private KakaoPhotoService service(KakaoPhotoService.PageFetcher fetcher) {
        return new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("photos.json"), true, 0, fetcher);
    }
    @Test void collectsPublicPhotoPersistsAndRetainsOriginalBusinessData() throws Exception {
        var calls = new AtomicInteger();
        var service = service(id -> { calls.incrementAndGet(); assertEquals("123456", id); return html(IMAGE); });
        var result = service.collect(place, match);
        assertEquals("collected", result.status());
        assertEquals(IMAGE, result.place().image());
        assertEquals(place.source(), result.place().source());
        assertEquals(place.address(), result.place().address());
        assertEquals(place.latitude(), result.place().latitude());
        assertEquals("kakao", result.place().imageSource());
        assertEquals("https://place.map.kakao.com/123456", result.place().imagePage());
        assertFalse(result.place().imageCollectedAt().isBlank());
        assertEquals("available", service.collect(place, match).status());
        assertEquals(1, calls.get());
        var restarted = service(id -> { fail("A restart must reuse the disk cache"); return ""; });
        assertEquals(IMAGE, restarted.cached(place).image());
        var relocated = new Place(place.id(), place.name(), place.category(), "부산광역시 다른 주소", "", "", "", "", "", "xlsx");
        assertTrue(restarted.cached(relocated).image().isBlank());
    }
    @Test void wrongBranchWrongTitleWrongPageAndMapFallbackNeverBecomeBusinessPhotos() {
        var otherBranch = new KakaoPhotoService.Match("123457", match.name(), "부산 해운대구 다른길 20", "", "129.1", "35.1");
        assertEquals("unmatched", service(id -> { fail("Do not crawl an unmatched business"); return ""; }).collect(place, otherBranch).status());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("테스트 카페", "다른 카페")).isEmpty());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("com/123456", "com/987654")).isEmpty());
        assertTrue(KakaoPhotoService.parse(place, match, html("http://staticmap.kakao.com/staticmap/og?type=place")).isEmpty());
        assertTrue(KakaoPhotoService.parse(place, match, html(IMAGE).replace("서울 종로구 인사동 1 2층", "부산 다른 주소")).isEmpty());
        assertFalse(KakaoPhotoService.validImage("https://evil.test/local/kakaomapPhoto/1.jpg"));
        assertFalse(KakaoPhotoService.validImage("https://img1.kakaocdn.net/local/kakaomapPhoto/@evil.test".replace("kakaocdn.net/", "kakaocdn.net.evil.test/")));
        assertFalse(KakaoPhotoService.validImage("https://t1.kakaocdn.net/logo.png"));
    }
    @Test void missingPhotosAndNetworkFailuresAreNegativelyCached() {
        var count = new AtomicInteger();
        var noPhoto = service(id -> { count.incrementAndGet(); return html("https://t1.kakaocdn.net/logo.png"); });
        assertEquals("unavailable", noPhoto.collect(place, match).status());
        assertEquals("unavailable", noPhoto.collect(place, match).status());
        assertEquals(1, count.get());
        var unavailable = service(id -> { throw new java.io.IOException("403"); });
        assertEquals("unavailable", unavailable.collect(place, match).status());
        assertTrue(unavailable.cached(place).image().isBlank());
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
}
