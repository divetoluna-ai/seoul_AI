package kr.co.pettour;

import java.util.List;

public class Models {
    public record Region(String code, String name) {}
    public record Place(String id, String name, String category, String address, String image,
                        String phone, String longitude, String latitude, String modified, String source, String imageSource,
                        String imagePage, String imageCollectedAt) {
        public Place(String id, String name, String category, String address, String image,
                     String phone, String longitude, String latitude, String modified, String source, String imageSource) {
            this(id, name, category, address, image, phone, longitude, latitude, modified, source, imageSource, "", "");
        }
        public Place(String id, String name, String category, String address, String image,
                     String phone, String longitude, String latitude, String modified, String source) {
            this(id, name, category, address, image, phone, longitude, latitude, modified, source,
                image.isBlank() ? "" : source);
        }
        public Place(String id, String name, String category, String address, String image,
                     String phone, String longitude, String latitude, String modified) {
            this(id, name, category, address, image, phone, longitude, latitude, modified, "tourapi");
        }
    }
    public record PlacesResponse(List<Place> items, int total, int page, int pageSize, String mode, String warning) {
        public PlacesResponse(List<Place> items, int total, int page, int pageSize, String mode) {
            this(items, total, page, pageSize, mode, "");
        }
    }
    public record CatalogEntry(Place place, String districtCode) {}
    public record Detail(Place place, String overview, String hours, String restDay, String parking,
                         String animals, String requirements, String facilities, String other, String mode) {}
}
