package kr.co.pettour;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.core.io.ClassPathResource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static kr.co.pettour.Models.*;
import static org.mockito.Mockito.*;

class CsvFacilitiesTests {
    private CsvFacilities repository() throws Exception { return new CsvFacilities(JsonMapper.builder().build()); }

    @Test void cleanedDatasetReconcilesAndContainsOnlyEligibleRecords() throws Exception {
        var mapper = JsonMapper.builder().build();
        try (var input = new ClassPathResource("data/facilities-report.json").getInputStream();
             var data = new ClassPathResource("data/facilities.json").getInputStream()) {
            var report = mapper.readTree(input);
            var records = mapper.readTree(data);
            int excluded = 0;
            for (var count : report.path("excluded")) excluded += count.asInt();
            assertEquals(report.path("sourceRows").asInt(), records.size() + excluded);
            assertEquals(11047, records.size());
            assertEquals(8191, report.path("csvIncluded").asInt());
            assertEquals(2908, report.path("registrySources").get(0).path("sourceRows").asInt());
            assertEquals(2856, report.path("registrySources").get(0).path("added").asInt());
            assertEquals(33, report.path("registrySources").get(0).path("merged_existing").asInt());
            var ids = new HashSet<String>();
            for (var record : records) {
                assertTrue(ids.add(record.path("id").asText()));
                assertFalse(record.path("sourceCategory").asText().matches(".*(병원|약국).*"));
                if (!record.path("source").asText().equals("xlsx"))
                    assertFalse(record.path("name").asText().matches(".*(병원|약국).*"));
                assertFalse(record.path("name").asText().isBlank());
                assertFalse(record.path("address").asText().isBlank());
                if (record.path("source").asText().equals("xlsx")) {
                    assertTrue(record.path("latitude").asText().isBlank());
                    assertTrue(record.path("longitude").asText().isBlank());
                } else assertTrue(record.path("latitude").asDouble() >= 32);
            }
        }
    }

    @Test void localSearchDetailsAndPaginationWorkWithoutCredentials() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        when(client.isDemo()).thenReturn(true);
        var catalog = new CombinedPlaceService(tour, client, repo);
        var first = catalog.places("11", "", "all", "", "name", 1);
        assertEquals(1800, first.total());
        assertEquals("local", first.mode());
        assertEquals(9, first.items().size());
        var second = catalog.places("11", "", "all", "", "name", 2);
        assertTrue(Collections.disjoint(first.items(), second.items()));
        var detail = catalog.detail(first.items().getFirst().id());
        assertEquals(first.items().getFirst().source(), detail.place().source());
        assertFalse(detail.place().modified().isBlank());
        for (var district : catalog.districts("11")) {
            var filtered = catalog.places("11", district.code(), "all", "", "name", 1);
            assertTrue(filtered.total() > 0, district.name());
            assertTrue(filtered.items().stream().allMatch(p -> p.address().contains(district.name())));
        }
        var shops = catalog.places("11", "", "shopping", "", "name", 1);
        assertTrue(shops.total() > 0);
        assertTrue(shops.items().stream().allMatch(p -> p.category().equals("shopping")));
        var care = catalog.places("11", "", "care", "", "name", 1);
        assertTrue(care.total() > 0);
        var search = catalog.places("11", "", "all", first.items().getFirst().name(), "name", 1);
        assertTrue(search.items().contains(first.items().getFirst()));
        verifyNoInteractions(tour);
    }

    @Test void mergedCatalogRemovesCrossSourceDuplicatesAndKeepsOtherBranches() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        var local = repo.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> p.source().equals("csv")).findFirst().orElseThrow();
        var duplicate = new Place("123", local.name(), local.category(), local.address(), "", local.phone(), local.longitude(), local.latitude(), "20261112");
        var branch = new Place("456", local.name(), local.category(), "서울특별시 강남구 다른로 99", "", "", "127.5", "37.9", "20261112");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(duplicate, ""), new CatalogEntry(branch, "680")));
        var catalog = new CombinedPlaceService(tour, client, repo);
        var result = catalog.places("11", "", "all", "", "recent", 1);
        assertEquals(repo.inRegion("11").size() + 1, result.total());
        var sameName = catalog.places("11", "", "all", local.name(), "recent", 1);
        assertTrue(sameName.items().stream().anyMatch(p -> p.id().equals("456")));
        assertFalse(sameName.items().stream().anyMatch(p -> p.id().equals("123")));
        assertTrue(CombinedPlaceService.samePlace(local, duplicate));
        assertFalse(CombinedPlaceService.samePlace(local, branch));
    }

    @Test void apiFailureKeepsCsvAvailableAndReportsPartialResult() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        when(tour.catalog("11")).thenThrow(new TourClient.TourUnavailableException());
        var catalog = new CombinedPlaceService(tour, client, repo);
        var result = catalog.places("11", "", "all", "", "recent", 1);
        assertEquals("partial", result.mode());
        assertEquals(1800, result.total());
        assertFalse(result.warning().isBlank());
    }

    @Test void matchingApiPhotoIsRetainedInBothCsvListAndDirectDetail() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        var local = repo.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> p.source().equals("csv")).findFirst().orElseThrow();
        var api = new Place("123", local.name(), local.category(), local.address(), "https://example.com/real-place.jpg",
            local.phone(), local.longitude(), local.latitude(), "20261112");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(api, "")));
        var catalog = new CombinedPlaceService(tour, client, repo);
        // A direct detail request also works before the visitor has opened any list.
        var detail = catalog.detail(local.id());
        assertEquals(api.image(), detail.place().image());
        assertEquals("csv", detail.place().source());
        assertEquals("tourapi", detail.place().imageSource());
        assertEquals(repo.detail(local.id()).requirements(), detail.requirements());
        assertEquals(repo.detail(local.id()).hours(), detail.hours());
        var list = catalog.places("11", "", local.category(), local.name(), "name", 1);
        var merged = list.items().stream().filter(p -> p.id().equals(local.id())).findFirst().orElseThrow();
        assertEquals(api.image(), merged.image());
        assertEquals("tourapi", merged.imageSource());
        assertFalse(list.items().stream().anyMatch(p -> p.id().equals(api.id())));
    }

    @Test void galleryPhotoFillsMissingRepresentativeImageButNeverOtherBranches() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        var local = repo.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> p.source().equals("csv")).findFirst().orElseThrow();
        var api = new Place("123", local.name(), local.category(), local.address(), "", "", local.longitude(), local.latitude(), "");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(api, "")));
        when(tour.image("123")).thenReturn("https://example.com/gallery.jpg");
        var catalog = new CombinedPlaceService(tour, client, repo);
        assertEquals("https://example.com/gallery.jpg", catalog.detail(local.id()).place().image());
        var otherBranch = new Place("124", local.name(), local.category(), "다른 주소", "https://example.com/wrong.jpg", "", "128", "36", "");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(otherBranch, "")));
        assertEquals("", catalog.detail(local.id()).place().image());
    }

    @Test void missingGalleryDoesNotHideCsvDetails() throws Exception {
        var repo = repository();
        var tour = mock(TourService.class);
        var client = mock(TourClient.class);
        var local = repo.inRegion("11").stream().map(CsvFacilities.Facility::place).filter(p -> p.source().equals("csv")).findFirst().orElseThrow();
        var api = new Place("123", local.name(), local.category(), local.address(), "", "", local.longitude(), local.latitude(), "");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(api, "")));
        when(tour.image("123")).thenThrow(new TourClient.TourUnavailableException());
        var detail = new CombinedPlaceService(tour, client, repo).detail(local.id());
        assertEquals(local.id(), detail.place().id());
        assertEquals("", detail.place().image());
        assertEquals(repo.detail(local.id()).requirements(), detail.requirements());
    }

    @Test void registryOnlyPlacesRemainSearchableWithoutInventedCoordinatesOrConditions() throws Exception {
        var repo = repository();
        var client = mock(TourClient.class);
        when(client.isDemo()).thenReturn(true);
        var catalog = new CombinedPlaceService(mock(TourService.class), client, repo);
        var place = repo.inRegion("11").stream().map(CsvFacilities.Facility::place)
            .filter(p -> p.source().equals("xlsx")).findFirst().orElseThrow();
        var found = catalog.places("11", "", "restaurant", place.name(), "name", 1);
        assertTrue(found.items().stream().anyMatch(p -> p.id().equals(place.id())));
        var detail = catalog.detail(place.id());
        assertEquals("xlsx", detail.place().source());
        assertEquals("2026-11-14", detail.place().modified());
        assertTrue(detail.place().latitude().isBlank());
        assertTrue(detail.place().longitude().isBlank());
        assertTrue(detail.hours().isBlank());
        assertTrue(detail.animals().isBlank());
        assertTrue(detail.requirements().isBlank());
    }

    @Test void overlappingRegistryRecordsKeepTheirOriginalCoordinatesAndDetailFields() throws Exception {
        var repo = repository();
        var place = repo.inRegion("11").stream().map(CsvFacilities.Facility::place)
            .filter(p -> p.source().equals("csv+xlsx")).findFirst().orElseThrow();
        var detail = repo.detail(place.id());
        assertFalse(place.latitude().isBlank());
        assertFalse(place.longitude().isBlank());
        assertTrue(detail.other().contains("2026-11-14"));
        assertTrue(detail.other().contains("기존 문화시설 자료 기준"));
        assertTrue(place.id().matches("csv-[a-f0-9]{20}"));
    }
}
