package kr.co.pettour;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

@Component
public class TourClient {
    private final String key;
    private final String baseUrl;
    private final RestClient client;
    private final ObjectMapper mapper;

    public TourClient(@Value("${tour.api-key}") String key, @Value("${tour.base-url}") String baseUrl, ObjectMapper mapper) {
        this.key = key.contains("%") ? URLDecoder.decode(key, StandardCharsets.UTF_8) : key;
        this.baseUrl = baseUrl;
        this.mapper = mapper;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(15));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isDemo() { return key.isBlank(); }

    public JsonNode get(String operation, Map<String, ?> params) {
        var uri = UriComponentsBuilder.fromUriString(baseUrl + "/" + operation)
                .queryParam("serviceKey", "{serviceKey}").queryParam("MobileOS", "ETC")
                .queryParam("MobileApp", "PetTour").queryParam("_type", "json");
        var variables = new java.util.HashMap<String, Object>(params);
        variables.put("serviceKey", key);
        params.forEach((name, value) -> uri.queryParam(name, "{" + name + "}"));
        try {
            String raw = client.get().uri(uri.encode().buildAndExpand(variables).toUri())
                    .retrieve().body(String.class);
            JsonNode response = mapper.readTree(raw).path("response");
            String code = response.path("header").path("resultCode").asText();
            if (!code.equals("0000") && !code.equals("00")) throw new IllegalStateException("Invalid upstream response");
            return response.path("body");
        } catch (Exception ex) {
            // Never expose exception messages: upstream URLs may contain the service key.
            throw new TourUnavailableException();
        }
    }

    static List<JsonNode> items(JsonNode body) {
        var result = new ArrayList<JsonNode>();
        var items = body.path("items").path("item");
        if (items.isArray()) items.forEach(result::add);
        else if (items.isObject()) result.add(items);
        return result;
    }

    static String value(JsonNode node, String field) {
        return node.path(field).asText("").replaceAll("(?i)<br\\s*/?>", "\n").replaceAll("<[^>]*>", "").replace("&nbsp;", " ").replace("&amp;", "&").trim();
    }

    public static class TourUnavailableException extends RuntimeException {}
}
