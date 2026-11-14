package kr.co.pettour;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;
import java.util.HashMap;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlaceCategoryTests {
    private JsonNode json(String text) { return JsonMapper.builder().build().readTree(text); }
    @Test void gallerySupportsThumbnailFallbackAndHttpsTourismPhotos() {
        var client = mock(TourClient.class);
        when(client.get(eq("detailImage2"), anyMap())).thenReturn(json("""
            {"items":{"item":[{"originimgurl":"","smallimageurl":"http://tong.visitkorea.or.kr/cms/photo.jpg"}]}}
            """));
        assertEquals("https://tong.visitkorea.or.kr/cms/photo.jpg", new TourService(client).image("123"));
        assertEquals("", TourService.imageUrl("javascript:alert(1)"));
    }

    @Test void allPlacesDoesNotSendFoodFilterAndPreservesTypes() {
        var client = mock(TourClient.class);
        when(client.get(eq("areaBasedList2"), anyMap())).thenReturn(json("""
            {"totalCount":3159,"items":{"item":[
              {"contentid":"1","title":"공원","contenttypeid":"12"},
              {"contentid":"2","title":"숙소","contenttypeid":"32"},
              {"contentid":"3","title":"카페","contenttypeid":"39"}]}}
            """));
        var service = new TourService(client);
        var result = service.places("11", "", "all", "", "recent", 2);
        assertEquals(3159, result.total());
        assertEquals("attraction", result.items().get(0).category());
        assertEquals("stay", result.items().get(1).category());
        assertEquals("restaurant", result.items().get(2).category());
        verify(client).get("areaBasedList2", Map.of("lDongRegnCd", "11", "arrange", "C", "numOfRows", 9, "pageNo", 2));
    }

    @Test void eachCategoryCombinesWithKeywordRegionAndDistrict() {
        for (var category : TourService.CONTENT_TYPES.entrySet()) {
            var client = mock(TourClient.class);
            when(client.get(eq("searchKeyword2"), anyMap())).thenReturn(json("{\"totalCount\":0}"));
            var service = new TourService(client);
            service.places("11", "680", category.getKey(), "정원", "name", 1);
            var expected = new HashMap<String, Object>();
            expected.put("lDongRegnCd", "11"); expected.put("lDongSignguCd", "680");
            expected.put("contentTypeId", category.getValue()); expected.put("keyword", "정원");
            expected.put("arrange", "A"); expected.put("numOfRows", 9); expected.put("pageNo", 1);
            verify(client).get("searchKeyword2", expected);
        }
    }

    @Test void attractionDetailsUseAttractionTypeAndFields() {
        var client = mock(TourClient.class);
        when(client.get("detailCommon2", Map.of("contentId", "1"))).thenReturn(json("""
            {"items":{"item":[{"contentid":"1","contenttypeid":"12","title":"공원"}]}}
            """));
        when(client.get("detailIntro2", Map.of("contentId", "1", "contentTypeId", "12"))).thenReturn(json("""
            {"items":{"item":[{"usetime":"09:00~18:00","restdate":"연중무휴","parking":"주차 가능"}]}}
            """));
        when(client.get("detailPetTour2", Map.of("contentId", "1"))).thenReturn(json("{\"items\":\"\"}"));
        var detail = new TourService(client).detail("1");
        assertEquals("attraction", detail.place().category());
        assertEquals("09:00~18:00", detail.hours());
        assertEquals("연중무휴", detail.restDay());
        assertEquals("주차 가능", detail.parking());
        assertEquals("", detail.animals());
    }

    @Test void lodgingDetailsUseCheckInAndKeepPetInformation() {
        var client = mock(TourClient.class);
        when(client.get("detailCommon2", Map.of("contentId", "2"))).thenReturn(json("""
            {"items":{"item":[{"contentid":"2","contenttypeid":"32","title":"숙소"}]}}
            """));
        when(client.get("detailIntro2", Map.of("contentId", "2", "contentTypeId", "32"))).thenReturn(json("""
            {"items":{"item":[{"checkintime":"15:00","parkinglodging":"전용 주차장"}]}}
            """));
        when(client.get("detailPetTour2", Map.of("contentId", "2"))).thenReturn(json("""
            {"items":{"item":[{"acmpyPsblCpam":"소형견","acmpyNeedMtr":"이동장 지참"}]}}
            """));
        var detail = new TourService(client).detail("2");
        assertEquals("stay", detail.place().category());
        assertEquals("15:00", detail.hours());
        assertEquals("전용 주차장", detail.parking());
        assertEquals("소형견", detail.animals());
        assertEquals("이동장 지참", detail.requirements());
    }
}
