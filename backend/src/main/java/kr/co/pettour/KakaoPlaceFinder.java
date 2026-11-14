package kr.co.pettour;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import static kr.co.pettour.Models.Place;

/** Server-side lookup. The API key never leaves the backend. */
@Component
class KakaoPlaceFinder {
    private final String key;
    private final RestClient client;
    private long nextSearch;
    KakaoPlaceFinder(@Value("${kakao.photos.rest-api-key:}") String key,
                     @Value("${kakao.login.rest-api-key:}") String loginKey) {
        this.key = key.isBlank() ? loginKey.strip() : key.strip();
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        client = RestClient.builder().requestFactory(factory).build();
    }
    boolean enabled() { return !key.isEmpty(); }
    @Cacheable(value="kakaoPhotoMatches", sync=true)
    public synchronized KakaoPhotoService.Match find(Place place) {
        try {
            long wait = nextSearch - System.currentTimeMillis();
            if (wait > 0) Thread.sleep(wait);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Photo lookup interrupted");
        }
        nextSearch = System.currentTimeMillis() + 1100;
        var query = UriComponentsBuilder.fromUriString("https://dapi.kakao.com/v2/local/search/keyword.json")
            .queryParam("query", "{query}").queryParam("size", 15);
        boolean located = false;
        try {
            double x = Double.parseDouble(place.longitude()), y = Double.parseDouble(place.latitude());
            if (x >= 124 && x <= 132 && y >= 32 && y <= 40) {
                query.queryParam("x", x).queryParam("y", y).queryParam("radius", 1000);
                located = true;
            }
        } catch (NumberFormatException ignored) {}
        String text = located ? place.name() : place.address().replaceAll("\\([^)]*\\)", "").strip() + " " + place.name();
        var uri = query.encode().buildAndExpand(Map.of("query", text.substring(0, Math.min(text.length(), 100)))).toUri();
        var response = client.get().uri(uri).header("Authorization", "KakaoAK " + key).retrieve().body(JsonNode.class);
        return match(place, response);
    }
    static KakaoPhotoService.Match match(Place place, JsonNode response) {
        if (response == null) return null;
        var matches = new LinkedHashMap<String, KakaoPhotoService.Match>();
        for (var d : response.path("documents")) {
            var candidate = new KakaoPhotoService.Match(d.path("id").asString(""), d.path("place_name").asString(""),
                d.path("road_address_name").asString(""), d.path("address_name").asString(""), d.path("x").asString(""), d.path("y").asString(""));
            if (KakaoPhotoService.sameBusiness(place, candidate)) matches.put(candidate.id(), candidate);
        }
        return matches.size() == 1 ? matches.values().iterator().next() : null;
    }
}
