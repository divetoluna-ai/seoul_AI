package kr.co.pettour;

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
    public KakaoPhotoController(CombinedPlaceService catalog, KakaoPhotoService photos) { this.catalog = catalog; this.photos = photos; }
    @PostMapping("/{id}/kakao-photo")
    public KakaoPhotoService.Result photo(@PathVariable @Pattern(regexp="[0-9]{1,20}|csv-[a-f0-9]{20}") String id,
        @RequestBody @Valid Input input) {
        var place = catalog.detail(id).place();
        return photos.collect(place, new KakaoPhotoService.Match(input.id(), input.name(), input.roadAddress(), input.lotAddress(), input.longitude(), input.latitude()));
    }
}
