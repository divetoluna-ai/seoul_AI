package kr.co.pettour;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
class AuthController {
    static final String SESSION_COOKIE = "daeng-session";
    static final String COOKIE_PATH = "/api/auth";
    private static final Logger LOG = LoggerFactory.getLogger(AuthController.class);

    record SessionInfo(boolean enabled, String loginOrigin, MemberStore.Member user) {}

    private final KakaoLoginClient kakao;
    private final MemberStore members;
    private final AuthSessionStore sessions;

    AuthController(KakaoLoginClient kakao, MemberStore members, AuthSessionStore sessions) {
        this.kakao = kakao;
        this.members = members;
        this.sessions = sessions;
    }

    @ModelAttribute
    void responseHeaders(HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @GetMapping("/session")
    SessionInfo session(HttpServletRequest request) {
        var member = members.find(sessions.memberId(browserToken(request)));
        return new SessionInfo(kakao.enabled(), kakao.origin(), member);
    }

    @GetMapping("/kakao")
    ResponseEntity<Void> start(@RequestParam(name = "section", defaultValue = "") String section, HttpServletRequest request) {
        String destination = switch (section) {
            case "community", "explore" -> section;
            default -> "";
        };
        if (!kakao.enabled()) return home(destination, "unavailable");

        String previousToken = browserToken(request);
        if (members.find(sessions.memberId(previousToken)) != null) return home(destination, "");
        var attempt = sessions.begin(previousToken, destination);
        return ResponseEntity.status(HttpStatus.SEE_OTHER).location(kakao.authorizationUrl(attempt.state(), challenge(attempt.verifier())))
                .header(HttpHeaders.SET_COOKIE, cookie(attempt.token(), AuthSessionStore.LOGIN_WINDOW)).build();
    }

    @GetMapping("/kakao/callback")
    ResponseEntity<Void> callback(@RequestParam(name = "state", defaultValue = "") String state,
                                  @RequestParam(name = "code", defaultValue = "") String code,
                                  @RequestParam(name = "error", defaultValue = "") String error,
                                  HttpServletRequest request) {
        var attempt = sessions.consume(browserToken(request), state);
        if (attempt == null) return home("", "expired");
        if (!kakao.enabled()) return home(attempt.section(), "unavailable");
        if ("access_denied".equals(error)) return home(attempt.section(), "cancelled");
        if (!error.isEmpty() || code.isBlank()) {
            LOG.warn("Kakao authorization callback did not provide a usable code");
            return home(attempt.section(), "failed");
        }

        KakaoLoginClient.User user;
        try {
            user = kakao.authenticate(code, attempt.verifier());
        } catch (KakaoLoginClient.ClientCredentialsException ex) {
            return home(attempt.section(), "misconfigured");
        } catch (RuntimeException ex) {
            return home(attempt.section(), "failed");
        }

        try {
            var member = members.signIn(user);
            String token = sessions.signIn(member.id());
            return ResponseEntity.status(HttpStatus.SEE_OTHER).location(homeUri(attempt.section(), ""))
                    .header(HttpHeaders.SET_COOKIE, cookie(token, AuthSessionStore.SESSION_TIMEOUT)).build();
        } catch (IOException | RuntimeException ex) {
            LOG.warn("Could not complete the local Kakao sign-in ({})", ex.getClass().getSimpleName());
            return home(attempt.section(), "failed");
        }
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(@RequestHeader(name = "X-Auth-Client", defaultValue = "") String client,
                                HttpServletRequest request) {
        if (!"web".equals(client)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        sessions.revoke(browserToken(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO)).build();
    }

    private static String browserToken(HttpServletRequest request) {
        var cookies = request.getCookies();
        if (cookies != null) for (var cookie : cookies) if (SESSION_COOKIE.equals(cookie.getName())) return cookie.getValue();
        return null;
    }

    private String cookie(String token, Duration lifetime) {
        return ResponseCookie.from(SESSION_COOKIE, token).path(COOKIE_PATH).httpOnly(true)
                .secure(kakao.secureCookie()).sameSite("Lax").maxAge(lifetime).build().toString();
    }

    private static String challenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static ResponseEntity<Void> home(String section, String error) {
        return redirect(homeUri(section, error));
    }

    private static URI homeUri(String section, String error) {
        return URI.create("/" + (error.isEmpty() ? "" : "?login=" + error) + (section.isEmpty() ? "" : "#" + section));
    }

    private static ResponseEntity<Void> redirect(URI uri) {
        return ResponseEntity.status(HttpStatus.SEE_OTHER).location(uri).build();
    }
}
