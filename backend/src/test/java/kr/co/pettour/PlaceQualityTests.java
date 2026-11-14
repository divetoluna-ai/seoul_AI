package kr.co.pettour;

import org.junit.jupiter.api.Test;
import java.util.*;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlaceQualityTests {
    private Place place(String id, String name, String category) { return new Place(id, name, category, "서울 종로구 테스트길 1", "", "", "126.98", "37.57", ""); }
    @Test void excludesBrokenNamesAndUnrelatedShopsButPreservesRealShortAndForeignBrands() {
        for (var name : List.of("가나안경원 명동점", "금강안경", "PR성형외과의원", "테스트 약국", "휴대폰대리점", "공인중개사사무소", "네일스튜디오"))
            assertFalse(PlaceQuality.allowed(place("1", name, "shopping")), name);
        for (var name : List.of("?커피,MOCC", "카페 드 조?", "카페 �", "---", "테스트", "123456789012"))
            assertFalse(PlaceQuality.allowed(place("1", name, "restaurant")), name);
        for (var p : List.of(place("1", "큰엉해안경승지", "attraction"), place("2", "반계리 은행나무", "attraction"),
            place("3", "프렌즈애견펜션", "stay"), place("4", "핑퐁커피 경대병원점", "restaurant"), place("5", "닷", "restaurant"),
            place("6", "1938", "restaurant"), place("7", "2Cats", "restaurant"), place("8", "프렌즈 애견미용실", "shopping")))
            assertTrue(PlaceQuality.allowed(p), p.name());
        assertEquals("care", PlaceQuality.clean(place("8", "강아지미용실", "shopping")).category());
        assertEquals("남이섬 스윙까페 & 베이커리", PlaceQuality.displayName("남이섬 스윙까페 &amp; 베이커리"));
        assertEquals("콩콩'짱짱 댕댕이집", PlaceQuality.displayName("콩콩&#39;짱짱 댕댕이집"));
    }
    @Test void liveCatalogFiltersBeforeCountingAndPagingAndBlockedDetailReturnsNotFound() {
        var tour = mock(TourService.class); var client = mock(TourClient.class); var csv = mock(CsvFacilities.class);
        when(csv.inRegion("11")).thenReturn(List.of());
        var optical = place("100", "가나안경원 명동점", "shopping");
        var clinic = place("101", "강남엔비의원", "shopping");
        var cafe = place("102", "카페 &amp; 정원", "restaurant");
        var broken = place("103", "?커피", "restaurant");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(optical, ""), new CatalogEntry(clinic, ""), new CatalogEntry(cafe, ""), new CatalogEntry(broken, "")));
        var service = new CombinedPlaceService(tour, client, csv);
        var result = service.places("11", "", "all", "", "photo", 1);
        assertEquals(1, result.total()); assertEquals("카페 & 정원", result.items().getFirst().name());
        when(tour.detail("100")).thenReturn(new Detail(optical, "", "", "", "", "", "", "", "", "live"));
        var ex = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.detail("100"));
        assertEquals(404, ex.getStatusCode().value());
    }
}
