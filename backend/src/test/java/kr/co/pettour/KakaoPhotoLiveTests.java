package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in check of the real public page; ordinary tests never depend on external access. */
@EnabledIfEnvironmentVariable(named="PET_TOUR_LIVE_PHOTO_TEST", matches="true")
class KakaoPhotoLiveTests {
    @TempDir Path directory;
    @Test void realPublicPlaceExposesAUsablePhoto() throws Exception {
        var place = new Place("live-smoke-check", "카카오프렌즈 스타필드코엑스몰", "shopping", "서울 강남구 삼성동 159-1", "", "", "127.06065597773711", "37.5102331506107", "", "csv");
        var match = new KakaoPhotoService.Match("26338954", place.name(), "서울 강남구 영동대로 513", place.address(), place.longitude(), place.latitude());
        var collector = new KakaoPhotoService(JsonMapper.builder().build(), directory.resolve("photos.json").toString(), true, 1100);
        var result = collector.collect(place, match);
        assertEquals("collected", result.status());
        assertEquals("kakao", result.place().imageSource());
        assertEquals("https://place.map.kakao.com/26338954", result.place().imagePage());
        var response = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build().send(
            HttpRequest.newBuilder(URI.create(result.place().image())).timeout(java.time.Duration.ofSeconds(15)).GET().build(),
            HttpResponse.BodyHandlers.discarding());
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("image/"));
    }
}
