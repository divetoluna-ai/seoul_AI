package kr.co.pettour;

import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.validation.constraints.*;
import jakarta.validation.ConstraintViolationException;
import java.util.*;
import static kr.co.pettour.Models.*;

@RestController
@RequestMapping("/api")
@Validated
public class TourController {
    private final TourService service;
    private final TourClient client;
    private final CombinedPlaceService catalog;
    public TourController(TourService service, TourClient client, CombinedPlaceService catalog) { this.service = service; this.client = client; this.catalog = catalog; }
    @GetMapping("/status") public Map<String, String> status() { return Map.of("mode", client.isDemo() ? "local" : "live"); }
    @GetMapping("/regions") public List<Region> regions() { return TourService.REGIONS; }
    @GetMapping("/districts") public List<Region> districts(@RequestParam String region) { return catalog.districts(region); }
    /** All place types, including attractions, accommodation, shopping and food. */
    @GetMapping("/tours") public Map<String, Object> tours(
        @RequestParam(defaultValue="") String region,
        @RequestParam(defaultValue="1") @Min(1) @Max(1000) int page) {
        if (client.isDemo()) throw new ResponseStatusException(HttpStatus.CONFLICT, "실제 API 조회에는 TOUR_API_KEY 설정이 필요합니다.");
        if (!region.isBlank() && TourService.REGIONS.stream().noneMatch(r -> r.code().equals(region))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지역을 확인해주세요.");
        }
        var params = new HashMap<String, Object>();
        params.put("pageNo", page);
        params.put("numOfRows", 9);
        params.put("arrange", "C");
        if (!region.isBlank()) params.put("lDongRegnCd", region);
        // Deliberately omit contentTypeId and category filters for the full dataset.
        var body = client.get("areaBasedList2", params);
        return Map.of("mode", "live", "total", body.path("totalCount").asInt(),
            "page", page, "pageSize", 9, "items", TourClient.items(body));
    }
    @GetMapping("/places") public PlacesResponse places(
        @RequestParam(defaultValue="11") String region,
        @RequestParam(defaultValue="") @Pattern(regexp="[0-9]{1,5}|local-[a-f0-9]{12}|^$") String district,
        @RequestParam(defaultValue="all") @Pattern(regexp="all|attraction|culture|festival|course|leisure|stay|shopping|restaurant|care") String category,
        @RequestParam(defaultValue="") @Size(max=60) String keyword,
        @RequestParam(defaultValue="photo") @Pattern(regexp="photo|recent|name") String sort,
        @RequestParam(defaultValue="1") @Min(1) @Max(1000) int page) {
        return catalog.places(region, district, category, keyword.trim(), sort, page);
    }
    @GetMapping("/places/{id}") public Detail detail(@PathVariable @Pattern(regexp="[0-9]{1,20}|csv-[a-f0-9]{20}") String id) { return catalog.detail(id); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(TourClient.TourUnavailableException.class)
    ResponseEntity<?> unavailable() {
        return ResponseEntity.status(502).body(Map.of("message", "공공데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요. 인증키의 활용 승인과 호출 한도를 확인해주세요."));
    }
    @ExceptionHandler({ConstraintViolationException.class, org.springframework.web.method.annotation.HandlerMethodValidationException.class})
    ResponseEntity<?> invalid(Exception ex) { return ResponseEntity.badRequest().body(Map.of("message", "검색 조건을 확인해주세요.")); }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> status(ResponseStatusException ex) { return ResponseEntity.status(ex.getStatusCode()).body(Map.of("message", Objects.requireNonNullElse(ex.getReason(), "요청을 확인해주세요."))); }
}
