package kr.co.pettour;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PointShopControllerTest {
    String row(String id, String price, String url) {
        return "<li id='anchorBoxId_"+id+"'><strong class='name'><a href='"+url+"'>강아지 옷</a></strong><span rel='판매가'>"+price+"</span><div class='prdImg'><img src='//ecimg.cafe24img.com/product.png'></div></li>";
    }
    @Test void readsSellingPriceAndDeduplicatesMerchantSections() {
        String html = row("73", "60,000원", "/product/bag/73/").replace("</div>", "<img class=\"thumb_Img\" src=\"//ecimg.cafe24img.com/medium.png\"></div>");
        var items = PointShopController.parse(Jsoup.parse(html+html, PointShopController.SOURCE));
        assertEquals(1, items.size());
        assertEquals(60000, items.getFirst().priceWon());
        assertEquals("https://ecimg.cafe24img.com/medium.png", items.getFirst().image());
        assertEquals("https://www.adorable-dog.com/product/bag/73/", items.getFirst().url());
    }
    @Test void ignoresUnavailablePricesAndUntrustedLinks() {
        var items = PointShopController.parse(Jsoup.parse(row("1","별도 문의","/product/a/1/")+row("2","0원","/product/b/2/")+row("3","100원","https://evil.test/product/3/"), PointShopController.SOURCE));
        assertTrue(items.isEmpty());
        assertFalse(PointShopController.photoUrl("javascript:alert(1)"));
    }
    @Test void marksSoldOutProducts() {
        var html = row("1","10,000원","/product/a/1/").replace("</li>","<img alt='품절' src='/soldout.gif'></li>");
        assertTrue(PointShopController.parse(Jsoup.parse(html, PointShopController.SOURCE)).getFirst().soldOut());
    }
}
