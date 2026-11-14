package kr.co.pettour;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.net.URI;
import java.net.http.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="tour.api-key=")
class TourIntegrationTests {
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();
    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api"+path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void regionFilterPaginationAndDetailsWork() throws Exception {
        var mapper = JsonMapper.builder().build();
        var first = mapper.readTree(get("/places?region=11").body());
        assertEquals(1800, first.path("total").asInt());
        assertEquals("local", first.path("mode").asText());
        assertEquals(9, first.path("items").size());
        assertEquals(9, mapper.readTree(get("/places?region=11&page=2").body()).path("items").size());
        var districts = mapper.readTree(get("/districts?region=11").body());
        String district = "";
        for (var d : districts) if (d.path("name").asText().equals("강남구")) district = d.path("code").asText();
        assertFalse(district.isBlank());
        var places = mapper.readTree(get("/places?region=11&district="+district).body());
        assertTrue(places.path("total").asInt() > 0);
        for (var item : places.path("items")) {
            assertTrue(java.util.Set.of("csv", "xlsx", "csv+xlsx").contains(item.path("source").asText()));
            assertTrue(item.path("address").asText().contains("강남구"));
        }
        assertEquals(200, get("/places/"+first.path("items").get(0).path("id").asText()).statusCode());
        for (String category : TourService.CONTENT_TYPES.keySet()) {
            var filtered = mapper.readTree(get("/places?region=11&category="+category).body());
            for (var item : filtered.path("items")) assertEquals(category, item.path("category").asText());
        }
        assertEquals(404, get("/places/csv-00000000000000000000").statusCode());
        assertEquals(200, get("/places?region=11&category=care").statusCode());
    }
    @Test void invalidInputIsRejected() throws Exception {
        assertEquals(400, get("/places?page=0").statusCode());
        assertEquals(400, get("/places?region=999").statusCode());
        assertEquals(400, get("/places?category=unknown").statusCode());
    }
    @Test void photoCollectionValidatesBothRecordAndKakaoIdsBeforeNetworkAccess() throws Exception {
        String valid = """
            {"id":"123456","name":"테스트 카페","roadAddress":"서울 종로구 인사동길 11","lotAddress":"","longitude":"","latitude":""}
            """;
        var invalid = HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/places/csv-ad62809a0cd954d8272b/kakao-photo"))
            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(valid.replace("123456", "../invalid"))).build();
        assertEquals(400, client.send(invalid, HttpResponse.BodyHandlers.ofString()).statusCode());
        var missing = HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/places/csv-00000000000000000000/kakao-photo"))
            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(valid)).build();
        assertEquals(404, client.send(missing, HttpResponse.BodyHandlers.ofString()).statusCode());
        var mismatched = HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/places/csv-ad62809a0cd954d8272b/kakao-photo"))
            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(valid)).build();
        var response = client.send(mismatched, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals("unmatched", JsonMapper.builder().build().readTree(response.body()).path("status").asText());
    }
}
