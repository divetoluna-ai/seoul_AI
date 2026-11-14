package kr.co.pettour;

import org.springframework.stereotype.Service;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;
import java.util.*;
import static kr.co.pettour.Models.*;
import static kr.co.pettour.TourClient.*;

@Service
public class TourService {
    private final TourClient client;
    public TourService(TourClient client) { this.client = client; }

    /** Fetch each upstream page once per region; local filtering then keeps merged totals exact. */
    @Cacheable(value="regionalCatalog", sync=true)
    public List<CatalogEntry> catalog(String region) {
        validateRegion(region);
        var found = new LinkedHashMap<String, CatalogEntry>();
        int page = 1, received = 0, total;
        do {
            var body = client.get("areaBasedList2", Map.of("lDongRegnCd", region, "numOfRows", 100, "pageNo", page, "arrange", "C"));
            var batch = items(body);
            total = body.path("totalCount").asInt();
            if (batch.isEmpty() && received < total) throw new TourClient.TourUnavailableException();
            for (var node : batch) {
                var place = toPlace(node);
                if (!place.id().isBlank()) found.putIfAbsent(place.id(), new CatalogEntry(place, value(node,"lDongSignguCd")));
            }
            received += batch.size();
            if (++page > 1000) throw new TourClient.TourUnavailableException();
        } while (received < total);
        return List.copyOf(found.values());
    }

    static final Map<String, String> CONTENT_TYPES = Map.of(
        "attraction", "12", "culture", "14", "festival", "15", "course", "25",
        "leisure", "28", "stay", "32", "shopping", "38", "restaurant", "39");

    public static final List<Region> REGIONS = List.of(
        new Region("11", "서울"), new Region("26", "부산"), new Region("27", "대구"),
        new Region("28", "인천"), new Region("29", "광주"), new Region("30", "대전"),
        new Region("31", "울산"), new Region("36", "세종"), new Region("41", "경기"),
        new Region("51", "강원"), new Region("43", "충북"), new Region("44", "충남"),
        new Region("52", "전북"), new Region("46", "전남"), new Region("47", "경북"),
        new Region("48", "경남"), new Region("50", "제주"));

    @Cacheable("districts")
    public List<Region> districts(String region) {
        validateRegion(region);
        if (client.isDemo()) return demoDistricts(region);
        return items(client.get("ldongCode2", Map.of("lDongRegnCd", region, "lDongListYn", "Y", "numOfRows", 200, "pageNo", 1)))
            .stream().map(n -> new Region(value(n, "lDongSignguCd"), value(n, "lDongSignguNm")))
            .filter(r -> !r.code().isBlank() && !r.name().isBlank()).distinct().toList();
    }

    @Cacheable("places")
    public PlacesResponse places(String region, String district, String category, String keyword, String sort, int page) {
        validateRegion(region);
        if (client.isDemo()) {
            var filtered = demoPlaces(region).stream()
                .filter(p -> district.isBlank() || p.id().split("-")[2].equals(district))
                .filter(p -> category.equals("all") || p.category().equals(category))
                .filter(p -> p.name().contains(keyword) || p.address().contains(keyword)).toList();
            var sorted = new ArrayList<>(filtered);
            if (sort.equals("name")) sorted.sort(Comparator.comparing(Place::name));
            int from = Math.min((page - 1) * 9, sorted.size());
            return new PlacesResponse(sorted.subList(from, Math.min(from + 9, sorted.size())), sorted.size(), page, 9, "demo");
        }
        var params = new HashMap<String, Object>();
        params.put("lDongRegnCd", region);
        if (!district.isBlank()) params.put("lDongSignguCd", district);
        if (!category.equals("all")) {
            String type = CONTENT_TYPES.get(category);
            if (type == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "카테고리를 확인해주세요.");
            params.put("contentTypeId", type);
        }
        params.put("arrange", sort.equals("name") ? "A" : "C");
        params.put("numOfRows", 9);
        params.put("pageNo", page);
        if (!keyword.isBlank()) params.put("keyword", keyword);
        JsonNode body = client.get(keyword.isBlank() ? "areaBasedList2" : "searchKeyword2", params);
        return new PlacesResponse(items(body).stream().map(this::toPlace).toList(), body.path("totalCount").asInt(), page, 9, "live");
    }

    @Cacheable("detail")
    public Detail detail(String id) {
        if (client.isDemo()) {
            Place place = REGIONS.stream().flatMap(r -> demoPlaces(r.code()).stream()).filter(p -> p.id().equals(id)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "장소를 찾을 수 없습니다."));
            return new Detail(place, "햇살 가득한 공간에서 반려견과 느긋한 시간을 보내는 모습을 담은 가상의 예시 장소입니다. 실제 매장 정보가 아닙니다.", "예시 10:00 – 20:00", "예시 매주 월요일", "예시 전용 주차 공간", "예시 소형견·중형견", "예시 목줄 착용, 이동 가방 지참", "예시 야외 테라스", "예시 정보입니다. 실제 방문에 사용할 수 없습니다.", "demo");
        }
        var common = items(client.get("detailCommon2", Map.of("contentId", id))).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "장소를 찾을 수 없습니다."));
        String type = value(common, "contenttypeid");
        var intro = type.isBlank() ? common.path("_missing")
            : first(client.get("detailIntro2", Map.of("contentId", id, "contentTypeId", type)));
        var pet = first(client.get("detailPetTour2", Map.of("contentId", id)));
        return new Detail(toPlace(common), value(common, "overview"), firstValue(intro,
            "usetime", "usetimeculture", "usetimeleports", "opentime", "opentimefood", "playtime", "checkintime"),
            firstValue(intro, "restdate", "restdateculture", "restdateleports", "restdateshopping", "restdatefood"),
            firstValue(intro, "parking", "parkingculture", "parkingleports", "parkinglodging", "parkingshopping", "parkingfood"), value(pet, "acmpyPsblCpam"),
            value(pet, "acmpyNeedMtr"), value(pet, "relaPosesFclty"), value(pet, "etcAcmpyInfo"), "live");
    }

    private JsonNode first(JsonNode body) { return items(body).stream().findFirst().orElse(body.path("_missing")); }
    private String firstValue(JsonNode node, String... fields) {
        for (String field : fields) {
            String text = value(node, field);
            if (!text.isBlank()) return text;
        }
        return "";
    }
    private Place toPlace(JsonNode n) {
        String category = CONTENT_TYPES.entrySet().stream()
            .filter(e -> e.getValue().equals(value(n, "contenttypeid")))
            .map(Map.Entry::getKey).findFirst().orElse("other");
        return new Place(value(n, "contentid"), value(n, "title"), category,
            (value(n, "addr1") + " " + value(n, "addr2")).trim(), firstImage(n, "firstimage", "firstimage2"), value(n, "tel"),
            value(n, "mapx"), value(n, "mapy"), value(n, "modifiedtime"));
    }
    @Cacheable("tourImages")
    public String image(String id) {
        int page = 1, received = 0, total;
        do {
            var body = client.get("detailImage2", Map.of("contentId", id, "imageYN", "Y", "numOfRows", 20, "pageNo", page));
            var batch = items(body);
            total = body.path("totalCount").asInt();
            for (var n : batch) {
                String url = firstImage(n, "originimgurl", "smallimageurl");
                if (!url.isBlank()) return url;
            }
            if (batch.isEmpty() && received < total) throw new TourClient.TourUnavailableException();
            received += batch.size();
            if (++page > 1000) throw new TourClient.TourUnavailableException();
        } while (received < total);
        return "";
    }
    private String firstImage(JsonNode node, String... fields) {
        for (String field : fields) {
            String image = imageUrl(value(node, field));
            if (!image.isBlank()) return image;
        }
        return "";
    }
    static String imageUrl(String url) {
        if (url == null || !url.matches("(?i)^https?://[^\\s]+$")) return "";
        return url.replaceFirst("(?i)^http://tong\\.visitkorea\\.or\\.kr/", "https://tong.visitkorea.or.kr/");
    }
    private void validateRegion(String region) {
        if (REGIONS.stream().noneMatch(r -> r.code().equals(region))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지역을 확인해주세요.");
    }
    static List<Region> demoDistricts(String region) {
        return region.equals("11") ? List.of(new Region("680", "강남구"), new Region("440", "마포구"), new Region("200", "성동구"))
            : List.of(new Region("demo", "예시 지역"));
    }
    static List<Place> demoPlaces(String region) {
        String name = REGIONS.stream().filter(r -> r.code().equals(region)).findFirst().orElseThrow().name();
        String[] names = {"초록빛 산책공원", "숲속 문화관", "댕댕 피크닉 축제", "강변 산책 코스", "함께 걷는 트레일", "포레스트 스테이", "우리동네 마켓", "오후의 정원 카페", "바람길 수목원", "작은 미술관", "온유 키친", "슬로우 선데이 숙소"};
        String[] categories = {"attraction", "culture", "festival", "course", "leisure", "stay", "shopping", "restaurant", "attraction", "culture", "restaurant", "stay"};
        var result = new ArrayList<Place>();
        var districts = demoDistricts(region);
        for (int i = 0; i < names.length; i++) {
            var d = districts.get(i % districts.size());
            result.add(new Place("demo-" + region + "-" + d.code() + "-" + i, names[i], categories[i],
                name + " " + d.name() + " · 가상의 예시 장소", "/images/place-" + (i % 6 + 1) + ".jpg", "", "", "", ""));
        }
        return result;
    }
}
