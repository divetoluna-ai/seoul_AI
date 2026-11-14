package kr.co.pettour;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;

class RegionalCatalogTests {
    @Test void fetchesEveryPageEvenWhenUpstreamClampsPageSize() {
        var client = mock(TourClient.class);
        var mapper = JsonMapper.builder().build();
        when(client.get("areaBasedList2", Map.of("lDongRegnCd","11","numOfRows",100,"pageNo",1,"arrange","C")))
            .thenReturn(mapper.readTree("{\"totalCount\":3,\"items\":{\"item\":[{\"contentid\":\"1\",\"contenttypeid\":\"12\"},{\"contentid\":\"2\",\"contenttypeid\":\"32\"}]}}"));
        when(client.get("areaBasedList2", Map.of("lDongRegnCd","11","numOfRows",100,"pageNo",2,"arrange","C")))
            .thenReturn(mapper.readTree("{\"totalCount\":3,\"items\":{\"item\":[{\"contentid\":\"3\",\"contenttypeid\":\"39\"}]}}"));
        var entries = new TourService(client).catalog("11");
        assertEquals(3, entries.size());
        assertEquals("restaurant", entries.get(2).place().category());
    }
    @Test void truncatedUpstreamIsNotReportedAsComplete() {
        var client = mock(TourClient.class);
        when(client.get(anyString(), anyMap())).thenReturn(JsonMapper.builder().build().readTree("{\"totalCount\":3,\"items\":\"\"}"));
        assertThrows(TourClient.TourUnavailableException.class, () -> new TourService(client).catalog("11"));
    }
}
