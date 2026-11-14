package kr.co.pettour;

import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.HexFormat;

/** Only downloads validated gallery URLs; HTTP clients cannot supply an arbitrary URL. */
final class KakaoPhotoFiles {
    @FunctionalInterface interface Downloader { byte[] download(String url) throws IOException; }
    record Asset(byte[] bytes, String contentType) {}
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final Path directory;
    private final Downloader downloader;
    KakaoPhotoFiles(Path directory) { this(directory, KakaoPhotoFiles::download); }
    KakaoPhotoFiles(Path directory, Downloader downloader) { this.directory = directory; this.downloader = downloader; }
    static String key(String url) {
        try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(url.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    boolean exists(String url) { return Files.isRegularFile(directory.resolve(key(url))); }
    void save(String url) throws IOException {
        if (!KakaoPhotoService.validImage(url)) throw new IOException("Invalid photo URL");
        if (exists(url)) return;
        byte[] bytes = downloader.download(url);
        if (bytes.length > MAX_BYTES || contentType(bytes) == null) throw new IOException("Invalid photo data");
        Files.createDirectories(directory);
        Path file = directory.resolve(key(url)), temp = Files.createTempFile(directory, "photo-", ".tmp");
        try {
            Files.write(temp, bytes);
            try { Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temp); }
    }
    Asset read(String url) throws IOException {
        byte[] bytes = Files.readAllBytes(directory.resolve(key(url)));
        String type = contentType(bytes);
        if (type == null) throw new IOException("Invalid cached image");
        return new Asset(bytes, type);
    }
    private static byte[] download(String url) throws IOException {
        try {
            var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).followRedirects(HttpClient.Redirect.NEVER).build();
            var response = client.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                if (response.statusCode() != 200 || !response.headers().firstValue("Content-Type").orElse("").startsWith("image/")) throw new IOException("Photo unavailable");
                return body.readNBytes(MAX_BYTES + 1);
            }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("Photo download interrupted"); }
    }
    static String contentType(byte[] bytes) {
        if (bytes.length < 12) return null;
        if ((bytes[0]&255)==255 && (bytes[1]&255)==216 && (bytes[2]&255)==255) return "image/jpeg";
        if (bytes[0]==(byte)137 && bytes[1]==80 && bytes[2]==78 && bytes[3]==71 && bytes[4]==13 && bytes[5]==10 && bytes[6]==26 && bytes[7]==10) return "image/png";
        if (new String(bytes, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") && new String(bytes, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        return null;
    }
}
