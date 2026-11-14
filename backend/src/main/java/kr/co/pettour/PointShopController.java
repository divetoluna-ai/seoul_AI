package kr.co.pettour;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CookieValue;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import java.net.URI;
import java.time.Instant;
import java.time.Duration;
import java.util.*;

/** Public merchant catalog only. No order creation or point deduction. */
@RestController
public class PointShopController {
    private final AuthSessionStore sessions;
    private final MemberStore members;
    public PointShopController(AuthSessionStore sessions, MemberStore members) { this.sessions = sessions; this.members = members; }
    static final String SOURCE = "https://www.adorable-dog.com/";
    private Catalog cached;
    private Instant retryAfter = Instant.EPOCH;
    public record Product(String id, String name, int priceWon, String image, String url, boolean soldOut) {}
    public record Catalog(String source, String fetchedAt, boolean stale, List<Product> products) {}

    @GetMapping({"/api/auth/shop/products", "/api/shop/products"})
    public synchronized Catalog products(@CookieValue(name=AuthController.SESSION_COOKIE, required=false) String token, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        if (members.find(sessions.memberId(token)) == null)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 후 포인트 상점을 이용해주세요.");
        Instant now = Instant.now();
        if (cached != null && now.isBefore(Instant.parse(cached.fetchedAt()).plus(Duration.ofHours(1)))) return cached;
        if (now.isBefore(retryAfter)) return fallback();
        try {
            Document doc = Jsoup.connect(SOURCE).userAgent("DaengDaengMap/1.0 (public product catalog)")
                .timeout(12000).maxBodySize(3_000_000).get();
            List<Product> items = parse(doc);
            if (items.isEmpty()) throw new IllegalStateException("Empty merchant catalog");
            cached = new Catalog(SOURCE, now.toString(), false, items);
            return cached;
        } catch (Exception e) {
            retryAfter = now.plusSeconds(60);
            return fallback();
        }
    }

    private Catalog fallback() {
        if (cached != null) return new Catalog(SOURCE, cached.fetchedAt(), true, cached.products());
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "상품 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.");
    }

    static List<Product> parse(Document doc) {
        Map<String, Product> items = new LinkedHashMap<>();
        for (var row : doc.select("li[id^=anchorBoxId_]")) {
            var link = row.selectFirst(".name a");
            var price = row.selectFirst("[rel=판매가]");
            var image = row.selectFirst(".prdImg img.thumb_Img");
            if (image == null) image = row.selectFirst(".prdImg img");
            if (link == null || price == null || image == null) continue;
            String id = row.id().replace("anchorBoxId_", "");
            String amount = price.text().replaceAll("[^0-9]", "");
            String url = link.absUrl("href");
            String photo = image.absUrl("src");
            if (!id.matches("[0-9]+") || amount.isEmpty() || link.text().isBlank() || !merchantUrl(url) || !photoUrl(photo)) continue;
            try {
                int won = Integer.parseInt(amount);
                if (won <= 0) continue;
                boolean soldOut = row.selectFirst(".soldout img, img[alt=품절]") != null;
                items.putIfAbsent(id, new Product(id, link.text(), won, photo, url, soldOut));
            } catch (NumberFormatException ignored) { /* Never show a fabricated/free price. */ }
        }
        return List.copyOf(items.values());
    }
    static boolean merchantUrl(String value) {
        try { URI u = URI.create(value); return "https".equals(u.getScheme()) && Set.of("www.adorable-dog.com", "adorable-dog.com").contains(u.getHost()) && u.getPath().startsWith("/product/"); }
        catch (Exception e) { return false; }
    }
    static boolean photoUrl(String value) {
        try { URI u = URI.create(value); String host = u.getHost(); return "https".equals(u.getScheme()) && host != null && (host.equals("ecimg.cafe24img.com") || host.equals("www.adorable-dog.com") || host.equals("adorable-dog.com")); }
        catch (Exception e) { return false; }
    }
}
