package kr.co.pettour;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PhotoFallbackTests {
    final Place place = new Place("csv-01234567890123456789", "테스트 카페", "restaurant", "서울 종로구 인사동길 11", "", "", "126.986787", "37.57182943", "", "csv");
    final JsonMapper mapper = JsonMapper.builder().build();
    Detail detail(Place p) { return new Detail(p, "", "", "", "", "", "", "", "", "local"); }

    @Test void officialPhotosPreventAnyKakaoLookupAndMissingPhotosUseTheServerFinder() {
        var catalog = mock(CombinedPlaceService.class); var photos = mock(KakaoPhotoService.class); var finder = mock(KakaoPlaceFinder.class);
        var controller = new KakaoPhotoController(catalog, photos, finder);
        var official = new Place(place.id(), place.name(), place.category(), place.address(), "https://example.com/photo.jpg", "", "", "", "", "csv", "tourapi");
        when(catalog.detail(place.id())).thenReturn(detail(official));
        assertEquals(official, controller.automaticPhoto(place.id()).place());
        verifyNoInteractions(photos, finder);
        when(catalog.detail(place.id())).thenReturn(detail(place)); when(photos.enabled()).thenReturn(true); when(finder.enabled()).thenReturn(true);
        var match = new KakaoPhotoService.Match("123", place.name(), place.address(), "", place.longitude(), place.latitude());
        when(finder.find(place)).thenReturn(match); when(photos.collect(place, match)).thenReturn(new KakaoPhotoService.Result("collected", official));
        assertEquals("collected", controller.automaticPhoto(place.id()).status());
        verify(photos).collect(place, match);
    }
    @Test void disabledCollectionNeverSearchesAndMissingServerKeyAllowsExistingSdkFallback() {
        var catalog = mock(CombinedPlaceService.class); var photos = mock(KakaoPhotoService.class); var finder = mock(KakaoPlaceFinder.class);
        when(catalog.detail(place.id())).thenReturn(detail(place));
        var controller = new KakaoPhotoController(catalog, photos, finder);
        assertEquals("disabled", controller.automaticPhoto(place.id()).status()); verifyNoInteractions(finder);
        when(photos.enabled()).thenReturn(true);
        assertEquals("search-required", controller.automaticPhoto(place.id()).status()); verify(finder, never()).find(any());
    }
    @Test void ambiguousOrDifferentBranchResultsDoNotBecomePhotos() {
        var candidate = Map.of("id", "123", "place_name", place.name(), "road_address_name", place.address(), "x", place.longitude(), "y", place.latitude());
        assertNotNull(KakaoPlaceFinder.match(place, mapper.valueToTree(Map.of("documents", List.of(candidate)))));
        var other = new HashMap<>(candidate); other.put("id", "456");
        assertNull(KakaoPlaceFinder.match(place, mapper.valueToTree(Map.of("documents", List.of(candidate, other)))));
        other.put("road_address_name", "부산 다른 주소"); other.put("x", "129.1"); other.put("y", "35.1");
        assertNull(KakaoPlaceFinder.match(place, mapper.valueToTree(Map.of("documents", List.of(other)))));
    }
    @Test void detailedPublicImagesContinuePastBlankPagesAndUseValidThumbnailIfOriginalIsInvalid() {
        var client = mock(TourClient.class); var tour = new TourService(client);
        when(client.get(eq("detailImage2"), anyMap())).thenAnswer(inv -> {
            Map<String, Object> params = inv.getArgument(1);
            var items = params.get("pageNo").equals(1) ? Collections.nCopies(20, Map.of("originimgurl", ""))
                : List.of(Map.of("originimgurl", "not an image", "smallimageurl", "http://tong.visitkorea.or.kr/thumbnail.jpg"));
            return mapper.valueToTree(Map.of("totalCount", 21, "items", Map.of("item", items)));
        });
        assertEquals("https://tong.visitkorea.or.kr/thumbnail.jpg", tour.image("123"));
        verify(client, times(2)).get(eq("detailImage2"), anyMap());
    }
    @Test void cachedKakaoPhotoCannotHideAUsableOfficialDetailedImage() {
        var tour = mock(TourService.class); var client = mock(TourClient.class); var csv = mock(CsvFacilities.class); var photos = mock(KakaoPhotoService.class);
        var local = new CsvFacilities.Facility(place, "11", "종로구", detail(place));
        var remote = new Place("123", place.name(), place.category(), place.address(), "", "", "", "", "");
        when(csv.inRegion("11")).thenReturn(List.of(local)); when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(remote, "")));
        when(tour.image("123")).thenReturn("https://example.com/official.jpg");
        when(photos.cached(any())).thenAnswer(inv -> {
            Place p = inv.getArgument(0);
            return p.image().isBlank() ? new Place(p.id(), p.name(), p.category(), p.address(), "https://t1.kakaocdn.net/local/kakaomapPhoto/review/a.jpg", "", p.longitude(), p.latitude(), "", "csv", "kakao") : p;
        });
        var result = new CombinedPlaceService(tour, client, csv, photos).places("11", "", "all", "", "photo", 1).items().getFirst();
        assertEquals("tourapi", result.imageSource()); assertEquals("https://example.com/official.jpg", result.image());
    }
}
