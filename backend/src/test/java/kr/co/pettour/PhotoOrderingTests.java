package kr.co.pettour;

import org.junit.jupiter.api.Test;
import java.util.*;
import static kr.co.pettour.Models.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class PhotoOrderingTests {
    private final TourService tour = mock(TourService.class);
    private final TourClient client = mock(TourClient.class);
    private final CsvFacilities csv = mock(CsvFacilities.class);
    private final KakaoPhotoService photos = mock(KakaoPhotoService.class);
    private final List<CsvFacilities.Facility> local = new ArrayList<>();

    private CombinedPlaceService catalog(boolean localOnly) {
        for (int i = 0; i < 20; i++) {
            var p = new Place("csv-%020d".formatted(i), "장소%02d".formatted(i), "restaurant", "서울특별시 종로구 테스트길 " + (i+1),
                "", "", "", "", i < 8 ? "20261114" : "20200101", "csv");
            local.add(new CsvFacilities.Facility(p, "11", "종로구", null));
        }
        when(client.isDemo()).thenReturn(localOnly);
        when(csv.inRegion("11")).thenReturn(local);
        when(photos.cached(any(Place.class))).thenAnswer(invocation -> {
            Place p = invocation.getArgument(0);
            if (!p.image().isBlank() || !p.id().startsWith("csv-") || Integer.parseInt(p.id().substring(4)) < 8) return p;
            return new Place(p.id(), p.name(), p.category(), p.address(), "https://t1.kakaocdn.net/local/kakaomapPhoto/review/" + p.id() + ".jpg",
                p.phone(), p.longitude(), p.latitude(), p.modified(), p.source(), "kakao", "https://place.map.kakao.com/123", "2026-11-14T00:00:00Z");
        });
        return new CombinedPlaceService(tour, client, csv, photos);
    }
    @Test void cachedPhotosMoveAcrossPageBoundariesBeforePlacesWithoutPhotos() {
        var catalog = catalog(true);
        var first = catalog.places("11", "", "all", "", "photo", 1);
        assertEquals(20, first.total());
        assertEquals(9, first.items().size());
        assertTrue(first.items().stream().allMatch(p -> p.imageSource().equals("kakao")));
        var second = catalog.places("11", "", "all", "", "photo", 2);
        assertTrue(second.items().subList(0, 3).stream().allMatch(p -> !p.image().isBlank()));
        assertTrue(second.items().subList(3, 9).stream().allMatch(p -> p.image().isBlank()));
        var all = new ArrayList<>(first.items()); all.addAll(second.items());
        all.addAll(catalog.places("11", "", "all", "", "photo", 3).items());
        assertEquals(20, all.stream().map(Place::id).distinct().count());
        assertEquals(12, all.stream().filter(p -> !p.image().isBlank()).count());
        assertEquals("장소19", catalog.places("11", "", "restaurant", "장소19", "photo", 1).items().getFirst().name());
        assertTrue(catalog.places("11", "", "stay", "", "photo", 1).items().isEmpty());
        verifyNoInteractions(tour);
        verify(photos, never()).collect(any(), any());
    }
    @Test void explicitDateAndNameOrderingStayAvailable() {
        var catalog = catalog(true);
        assertEquals("장소00", catalog.places("11", "", "all", "", "recent", 1).items().getFirst().name());
        assertEquals("장소00", catalog.places("11", "", "all", "", "name", 1).items().getFirst().name());
    }
    @Test void officialPhotosAndCollectedPhotosShareThePriorityWithoutLosingProvenance() {
        var catalog = catalog(false);
        Place localPlace = local.get(8).place();
        var merged = new Place("123", localPlace.name(), localPlace.category(), localPlace.address(), "https://example.com/official.jpg",
            "", "", "", "20200101");
        var remote = new Place("456", "가나다 사진 장소", "restaurant", "서울 종로구 새길 22", "https://example.com/remote.jpg", "", "", "", "20200101");
        when(tour.catalog("11")).thenReturn(List.of(new CatalogEntry(merged, ""), new CatalogEntry(remote, "")));
        var result = catalog.places("11", "", "all", "", "photo", 1);
        assertEquals(21, result.total());
        assertTrue(result.items().stream().allMatch(p -> !p.image().isBlank()));
        assertTrue(result.items().stream().anyMatch(p -> p.id().equals("456") && p.imageSource().equals("tourapi")));
        assertTrue(result.items().stream().anyMatch(p -> p.id().equals(localPlace.id()) && p.source().equals("csv") && p.imageSource().equals("tourapi")));
    }
}
