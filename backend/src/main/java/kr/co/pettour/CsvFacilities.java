package kr.co.pettour;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static kr.co.pettour.Models.*;

/** Loads normalized CSV and registry workbook records. Original files remain unchanged. */
@Component
public class CsvFacilities {
    public record Facility(Place place, String region, String district, Detail detail) {}
    private final List<Facility> facilities;
    private final Map<String, Facility> byId;

    public CsvFacilities(ObjectMapper mapper) throws java.io.IOException {
        var result = new ArrayList<Facility>();
        try (var input = new ClassPathResource("data/facilities.json").getInputStream()) {
            for (JsonNode n : mapper.readTree(input)) {
                String source = text(n,"source").isBlank() ? "csv" : text(n,"source");
                var p = new Place(text(n,"id"), text(n,"name"), text(n,"category"), text(n,"address"), "",
                    text(n,"phone"), text(n,"longitude"), text(n,"latitude"), text(n,"modified"), source);
                if (!PlaceQuality.allowed(p)) continue;
                p = PlaceQuality.clean(p);
                var d = new Detail(p, text(n,"overview"), text(n,"hours"), text(n,"restDay"), text(n,"parking"),
                    text(n,"animals"), text(n,"requirements"), text(n,"facilities"), text(n,"other"), "local");
                result.add(new Facility(p, text(n,"region"), text(n,"district"), d));
            }
        }
        facilities = List.copyOf(result);
        var index = new HashMap<String, Facility>();
        facilities.forEach(f -> index.put(f.place().id(), f));
        byId = Map.copyOf(index);
    }
    private static String text(JsonNode n, String field) { return n.path(field).asText(""); }
    public List<Facility> inRegion(String region) { return facilities.stream().filter(f -> f.region().equals(region)).toList(); }
    public Detail detail(String id) {
        return facility(id).detail();
    }
    public Facility facility(String id) {
        var f = byId.get(id);
        if (f == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "장소를 찾을 수 없습니다.");
        return f;
    }
    public List<Region> districts(String region) {
        return inRegion(region).stream().map(Facility::district).filter(s -> !s.isBlank()).distinct().sorted()
            .map(name -> new Region(districtId(region, name), name)).toList();
    }
    static String districtId(String region, String name) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest((region+"|"+name).getBytes(StandardCharsets.UTF_8));
            return "local-" + HexFormat.of().formatHex(digest).substring(0,12);
        } catch (java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
