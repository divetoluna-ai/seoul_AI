package kr.co.pettour;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

@Component
class KakaoLoginClient {
    static final String CALLBACK_PATH = "/api/auth/kakao/callback";
    private static final Logger LOG = LoggerFactory.getLogger(KakaoLoginClient.class);

    record User(long id, String nickname) {}
    static class ClientCredentialsException extends RuntimeException {}

    private final String clientId;
    private final String clientSecret;
    private final URI redirectUri;
    private final RestClient http;

    @Autowired
    KakaoLoginClient(@Value("${kakao.login.rest-api-key}") String clientId,
                     @Value("${kakao.login.client-secret}") String clientSecret,
                     @Value("${kakao.login.redirect-uri}") String redirectUri) {
        this(clientId, clientSecret, redirectUri, httpClient());
    }

    KakaoLoginClient(String clientId, String clientSecret, String redirectUri, RestClient http) {
        this.clientId = clientId.strip();
        this.clientSecret = clientSecret.strip();
        this.redirectUri = URI.create(redirectUri.strip());
        this.http = http;
        String host = this.redirectUri.getHost();
        if (host == null || this.redirectUri.getUserInfo() != null || this.redirectUri.getRawQuery() != null
                || this.redirectUri.getRawFragment() != null || !CALLBACK_PATH.equals(this.redirectUri.getRawPath())
                || (!secureCookie() && !("http".equals(this.redirectUri.getScheme())
                    && Set.of("localhost", "127.0.0.1", "[::1]").contains(host)))) {
            throw new IllegalArgumentException("KAKAO_LOGIN_REDIRECT_URI must be an HTTPS callback or a local HTTP callback");
        }
    }

    private static RestClient httpClient() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder().requestFactory(factory).build();
    }

    boolean enabled() { return !clientId.isEmpty(); }

    boolean secureCookie() { return "https".equals(redirectUri.getScheme()); }

    String origin() { return redirectUri.getScheme() + "://" + redirectUri.getRawAuthority(); }

    URI authorizationUrl(String state, String challenge) {
        return UriComponentsBuilder.fromUriString("https://kauth.kakao.com/oauth/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", "{clientId}")
                .queryParam("redirect_uri", "{redirectUri}")
                .queryParam("state", "{state}")
                .queryParam("code_challenge", "{challenge}")
                .queryParam("code_challenge_method", "S256")
                .encode().buildAndExpand(Map.of("clientId", clientId, "redirectUri", redirectUri.toString(),
                        "state", state, "challenge", challenge)).toUri();
    }

    User authenticate(String code, String verifier) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("redirect_uri", redirectUri.toString());
        form.add("code", code);
        form.add("code_verifier", verifier);
        if (!clientSecret.isEmpty()) form.add("client_secret", clientSecret);

        var token = readKakaoResponse(http.post().uri("https://kauth.kakao.com/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form), "token exchange");
        String accessToken = token == null ? "" : token.path("access_token").asString("");
        if (accessToken.isBlank()) {
            LOG.warn("Kakao token exchange returned no access token");
            throw new IllegalStateException("Kakao did not return an access token");
        }

        var user = readKakaoResponse(http.get().uri("https://kapi.kakao.com/v2/user/me?property_keys={keys}", "[\"kakao_account.profile\"]")
                .headers(headers -> headers.setBearerAuth(accessToken)), "user lookup");
        if (user == null || !user.path("id").isIntegralNumber() || !user.path("id").canConvertToLong()) {
            LOG.warn("Kakao user lookup returned no valid user ID");
            throw new IllegalStateException("Kakao did not return a valid user ID");
        }
        return new User(user.path("id").asLong(), user.path("kakao_account").path("profile").path("nickname").asString(""));
    }

    private JsonNode readKakaoResponse(RestClient.RequestHeadersSpec<?> request, String stage) {
        try {
            return request.retrieve().body(JsonNode.class);
        } catch (RestClientResponseException ex) {
            String code = kakaoErrorCode(ex);
            LOG.warn("Kakao {} failed (HTTP {}, code {})", stage, ex.getStatusCode().value(), code);
            if ("KOE010".equals(code)) throw new ClientCredentialsException();
            throw ex;
        } catch (RestClientException ex) {
            LOG.warn("Kakao {} failed ({})", stage, ex.getClass().getSimpleName());
            throw ex;
        }
    }

    private static String kakaoErrorCode(RestClientResponseException ex) {
        try {
            var body = ex.getResponseBodyAs(JsonNode.class);
            if (body != null) {
                String code = body.path("error_code").asString("");
                if (code.matches("KOE[0-9]{3}|-?[0-9]{1,4}")) return code;
            }
        } catch (RuntimeException ignored) {
            // Kakao or an intermediary may return a non-JSON error response.
        }
        return "unknown";
    }
}
