package kr.co.pettour;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class TourClientTests {
    @Test void encodesCredentialsAndKeywordExactlyOnce() throws Exception {
        var request = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/areaBasedList2", exchange -> {
            request.set(exchange.getRequestURI().getRawQuery());
            byte[] body = "{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":\"\",\"totalCount\":0}}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client = new TourClient("abc%2Bdef%2F%3D", "http://127.0.0.1:"+server.getAddress().getPort(), JsonMapper.builder().build());
            assertEquals(0, client.get("areaBasedList2", Map.of("keyword", "카페 & {정원}")).path("totalCount").asInt());
            assertTrue(request.get().contains("serviceKey=abc%2Bdef%2F%3D"));
            assertTrue(request.get().contains("%7B"));
            assertFalse(request.get().contains("%252B"));
        } finally { server.stop(0); }
    }
    @Test void upstreamFailuresDoNotExposeServiceKey() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/bad", exchange -> {
            byte[] body = "<error>INVALID_KEY</error>".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client = new TourClient("secret", "http://127.0.0.1:"+server.getAddress().getPort(), JsonMapper.builder().build());
            var error = assertThrows(TourClient.TourUnavailableException.class, () -> client.get("bad", Map.of()));
            assertNull(error.getMessage()); assertNull(error.getCause());
        } finally { server.stop(0); }
    }
}
