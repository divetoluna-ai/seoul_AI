package kr.co.pettour;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.text.Collator;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;
import static kr.co.pettour.Models.*;

@Service
public class CombinedPlaceService {
    private final TourService tour;
    private final TourClient client;
    private final CsvFacilities csv;
    private final KakaoPhotoService photos;
    public CombinedPlaceService(TourService tour, TourClient client, CsvFacilities csv) {
        this(tour, client, csv, null);
    }
    @Autowired
    public CombinedPlaceService(TourService tour, TourClient client, CsvFacilities csv, KakaoPhotoService photos) {
        this.tour = tour; this.client = client; this.csv = csv; this.photos = photos;
    }

    public List<Region> districts(String region) {
        validate(region);
        var result = new ArrayList<Region>();
        if (!client.isDemo()) {
            try { result.addAll(tour.districts(region)); }
            catch (TourClient.TourUnavailableException ignored) { /* Local districts remain usable. */ }
        }
        var names = new HashSet<String>();
        result.forEach(r -> names.add(r.name()));
        for (var d : csv.districts(region)) if (names.add(d.name())) result.add(d);
        result.sort(Comparator.comparing(Region::name, Collator.getInstance(Locale.KOREAN)));
        return result;
    }

    public PlacesResponse places(String region, String district, String category, String keyword, String sort, int page) {
        validate(region);
        List<CatalogEntry> remote = List.of();
        String mode = client.isDemo() ? "local" : "live";
        String warning = "";
        if (!client.isDemo()) {
            try { remote = tour.catalog(region); }
            catch (TourClient.TourUnavailableException ex) {
                mode = "partial";
                warning = "관광공사 API 연결이 지연되어 문화시설 자료와 동반가능 업소현황을 표시합니다. 잠시 후 다시 시도해주세요.";
            }
        }
        // Resolve official district codes to names for CSV records, which have no official codes.
        String districtName = "";
        if (!district.isBlank()) {
            var choices = district.startsWith("local-") ? csv.districts(region) : districts(region);
            districtName = choices.stream().filter(d -> d.code().equals(district)).map(Region::name).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "시군구를 다시 선택해주세요."));
        }
        final String selectedDistrict = districtName;
        var local = csv.inRegion(region);
        // Preserve local pet conditions and identity, while retaining the matching API photo.
        // Index names first; coordinate checks only run for identically named places.
        var index = new HashMap<String, List<Place>>();
        var merged = new LinkedHashMap<String, Place>();
        for (var f : local) {
            if (district.isBlank() || f.district().equals(selectedDistrict) || addressContainsDistrict(f.place().address(), selectedDistrict)) {
                merged.put(f.place().id(), f.place());
                index.computeIfAbsent(normalize(f.place().name()), k -> new ArrayList<>()).add(f.place());
            }
        }
        for (var entry : remote) {
            var p = entry.place();
            if (!district.isBlank() && !district.equals(entry.districtCode()) && !addressContainsDistrict(p.address(), selectedDistrict)) continue;
            var duplicates = index.getOrDefault(normalize(p.name()), List.of()).stream().filter(l -> samePlace(l, p)).toList();
            if (duplicates.isEmpty()) merged.putIfAbsent(p.id(), p);
            else for (var localPlace : duplicates) {
                var current = merged.get(localPlace.id());
                if (current.image().isBlank() && !p.image().isBlank()) merged.put(localPlace.id(), withImage(current, p.image()));
            }
        }
        String query = normalize(keyword);
        var matches = new ArrayList<>(merged.values().stream()
            .filter(p -> category.equals("all") || p.category().equals(category))
            .filter(p -> query.isBlank() || normalize(p.name()).contains(query) || normalize(p.address()).contains(query))
            // Include previously collected photos before pagination without making network requests.
            .map(p -> photos == null ? p : photos.cached(p)).toList());
        Comparator<Place> byName = Comparator.comparing(Place::name, Collator.getInstance(Locale.KOREAN));
        Comparator<Place> byRecent = Comparator.comparing((Place p) -> p.modified().replaceAll("[^0-9]", ""))
            .reversed().thenComparing(byName).thenComparing(Place::id);
        Comparator<Place> order = switch (sort) {
            case "name" -> byName.thenComparing(Place::id);
            case "photo" -> Comparator.comparing((Place p) -> p.image().isBlank()).thenComparing(byRecent);
            default -> byRecent;
        };
        matches.sort(order);
        int start = Math.min((page - 1) * 9, matches.size());
        var visible = new ArrayList<Place>();
        for (var p : matches.subList(start, Math.min(start + 9, matches.size()))) {
            Place origin = p.id().startsWith("csv-") ? matchingApi(p, remote) : p;
            visible.add(ensureImage(p, origin));
        }
        if (sort.equals("photo")) visible.sort(order);
        return new PlacesResponse(List.copyOf(visible), matches.size(), page, 9, mode, warning);
    }

    public Detail detail(String id) {
        if (!id.startsWith("csv-")) {
            var detail = tour.detail(id);
            return withPlace(detail, ensureImage(detail.place(), detail.place()));
        }
        var local = csv.facility(id);
        Place place = local.place();
        if (!client.isDemo()) {
            try { place = ensureImage(place, matchingApi(place, tour.catalog(local.region()))); }
            catch (TourClient.TourUnavailableException ignored) { /* CSV details remain readable. */ }
        }
        return withPlace(local.detail(), photos == null ? place : photos.cached(place));
    }
    private Place matchingApi(Place local, List<CatalogEntry> remote) {
        return remote.stream().map(CatalogEntry::place).filter(p -> samePlace(local, p))
            .sorted(Comparator.comparing((Place p) -> p.image().isBlank()).thenComparing(Place::id))
            .findFirst().orElse(null);
    }
    private Place ensureImage(Place place, Place apiPlace) {
        if (!place.image().isBlank()) return place;
        if (apiPlace != null && !client.isDemo()) {
            String image = apiPlace.image();
            if (image.isBlank()) {
                try { image = tour.image(apiPlace.id()); }
                catch (TourClient.TourUnavailableException ignored) { image = ""; }
            }
            if (image != null && !image.isBlank()) return withImage(place, image);
        }
        return photos == null ? place : photos.cached(place);
    }
    private Place withImage(Place p, String image) {
        return new Place(p.id(), p.name(), p.category(), p.address(), image, p.phone(), p.longitude(), p.latitude(), p.modified(), p.source(), "tourapi");
    }
    private Detail withPlace(Detail d, Place p) {
        return new Detail(p, d.overview(), d.hours(), d.restDay(), d.parking(), d.animals(), d.requirements(), d.facilities(), d.other(), d.mode());
    }
    private void validate(String region) {
        if (TourService.REGIONS.stream().noneMatch(r -> r.code().equals(region))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지역을 확인해주세요.");
    }
    static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }
    private static boolean addressContainsDistrict(String address, String district) {
        return !district.isBlank() && Pattern.compile("(?:^|\\s)"+Pattern.quote(district)+"(?:\\s|$)").matcher(address).find();
    }
    static boolean samePlace(Place a, Place b) {
        if (!normalize(a.name()).equals(normalize(b.name()))) return false;
        if (!a.address().isBlank() && normalize(a.address()).equals(normalize(b.address()))) return true;
        try {
            double lat1 = Double.parseDouble(a.latitude()), lat2 = Double.parseDouble(b.latitude());
            double lon1 = Double.parseDouble(a.longitude()), lon2 = Double.parseDouble(b.longitude());
            if (lat1 < 32 || lat2 < 32 || lon1 < 124 || lon2 < 124) return false;
            double meters = Math.hypot((lat1-lat2)*111_320, (lon1-lon2)*111_320*Math.cos(Math.toRadians(lat1)));
            return meters <= 35;
        } catch (NumberFormatException ex) { return false; }
    }
}
