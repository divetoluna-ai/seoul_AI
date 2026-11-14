package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AllToursTests {
    @Test void nationwideQueryOmitsRegionAndFoodFilters() {
        var client = mock(TourClient.class);
        var body = JsonMapper.builder().build().readTree("{\"totalCount\":321,\"items\":{\"item\":[{\"contenttypeid\":\"12\"},{\"contenttypeid\":\"32\"}]}}");
        when(client.get(eq("areaBasedList2"), anyMap())).thenReturn(body);
        var controller = new TourController(mock(TourService.class), client, mock(CombinedPlaceService.class));
        var result = controller.tours("", 1);
        assertEquals(321, result.get("total"));
        verify(client).get("areaBasedList2", Map.of("pageNo", 1, "numOfRows", 9, "arrange", "C"));
    }

    @Test void regionalQueryKeepsRegionButOmitsFoodFilter() {
        var client = mock(TourClient.class);
        var body = JsonMapper.builder().build().readTree("{\"totalCount\":21}");
        when(client.get(eq("areaBasedList2"), anyMap())).thenReturn(body);
        var controller = new TourController(mock(TourService.class), client, mock(CombinedPlaceService.class));
        assertEquals(21, controller.tours("11", 2).get("total"));
        verify(client).get("areaBasedList2", Map.of("pageNo", 2, "numOfRows", 9, "arrange", "C", "lDongRegnCd", "11"));
    }

    @Test void demoModeNeverReturnsFakeApiTotals() {
        var client = mock(TourClient.class);
        when(client.isDemo()).thenReturn(true);
        var controller = new TourController(mock(TourService.class), client, mock(CombinedPlaceService.class));
        var error = assertThrows(ResponseStatusException.class, () -> controller.tours("", 1));
        assertEquals(409, error.getStatusCode().value());
        verify(client, never()).get(anyString(), anyMap());
    }
}
