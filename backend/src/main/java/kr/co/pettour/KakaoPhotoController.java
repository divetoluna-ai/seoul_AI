package kr.co.pettour;

import java.io.IOException;
import java.time.Duration;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/places")
public class KakaoPhotoController {
    public record Input(@NotNull @Pattern(regexp="[0-9]{1,20}") String id,
        @NotBlank @Size(max=300) String name,
        @NotNull @Size(max=500) String roadAddress, @NotNull @Size(max=500) String lotAddress,
        @NotNull @Size(max=30) String longitude, @NotNull @Size(max=30) String latitude) {}
    private final CombinedPlaceService catalog;
    private final KakaoPhotoService photos;
    private final KakaoPlaceFinder finder;
    public KakaoPhotoController(CombinedPlaceService catalog, KakaoPhotoService photos, KakaoPlaceFinder finder) {
        this.catalog = catalog; this.photos = photos; this.finder = finder;
    }
    @GetMapping("/photos/{key}")
    public ResponseEntity<byte[]> image(@PathVariable @Pattern(regexp="[a-f0-9]{64}") String key) {
        try {
            var asset = photos.asset(key);
            return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .header("X-Content-Type-Options", "nosniff").body(asset.bytes());
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "사진을 불러올 수 없습니다.");
        }
    }
    @PostMapping("/{id}/photo")
    public KakaoPhotoService.Result automaticPhoto(@PathVariable @Pattern(regexp="[0-9]{1,20}|csv-[a-f0-9]{20}") String id) {
        var place = catalog.detail(id).place();
        if (!place.image().isBlank()) return new KakaoPhotoService.Result("available", place);
        if (!photos.enabled()) return new KakaoPhotoService.Result("disabled", place);
        if (!finder.enabled()) return new KakaoPhotoService.Result("search-required", place);
        KakaoPhotoService.Match match;
        try { match = finder.find(place); }
        catch (RuntimeException ignored) { return new KakaoPhotoService.Result("search-required", place); }
        return match == null ? new KakaoPhotoService.Result("unmatched", place) : photos.collect(place, match);
    }
    @PostMapping("/{id}/kakao-photo")
    public KakaoPhotoService.Result photo(@PathVariable @Pattern(regexp="[0-9]{1,20}|csv-[a-f0-9]{20}") String id,
        @RequestBody @Valid Input input) {
        var place = catalog.detail(id).place();
        return photos.collect(place, new KakaoPhotoService.Match(input.id(), input.name(), input.roadAddress(), input.lotAddress(), input.longitude(), input.latitude()));
    }
}
