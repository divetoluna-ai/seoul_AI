package kr.co.pettour;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
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
    private static final String LOGIN_ATTEMPT = "kakaoLoginAttempt";
    private static final String MEMBER = "member";
    private static final Duration LOGIN_WINDOW = Duration.ofMinutes(10);
    private static final Duration SESSION_TIMEOUT = Duration.ofHours(12);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Logger LOG = LoggerFactory.getLogger(AuthController.class);

    private record LoginAttempt(String state, String verifier, String section, Instant expiresAt) {}
    record SessionInfo(boolean enabled, String loginOrigin, MemberStore.Member user) {}

    private final KakaoLoginClient kakao;
    private final MemberStore members;

    AuthController(KakaoLoginClient kakao, MemberStore members) {
        this.kakao = kakao;
        this.members = members;
    }

    @ModelAttribute
    void responseHeaders(HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @GetMapping("/session")
    SessionInfo session(HttpServletRequest request) {
        var session = request.getSession(false);
        var member = session == null ? null : (MemberStore.Member) session.getAttribute(MEMBER);
        return new SessionInfo(kakao.enabled(), kakao.origin(), member);
    }

    @GetMapping("/kakao")
    ResponseEntity<Void> start(@RequestParam(name = "section", defaultValue = "") String section, HttpServletRequest request) {
        String destination = switch (section) {
            case "community", "explore" -> section;
            default -> "";
        };
        if (!kakao.enabled()) return home(destination, "unavailable");

        var session = request.getSession(true);
        if (session.getAttribute(MEMBER) != null) return home(destination, "");
        var attempt = new LoginAttempt(randomValue(), randomValue(), destination, Instant.now().plus(LOGIN_WINDOW));
        session.setMaxInactiveInterval((int) LOGIN_WINDOW.toSeconds());
        session.setAttribute(LOGIN_ATTEMPT, attempt);
        return redirect(kakao.authorizationUrl(attempt.state(), challenge(attempt.verifier())));
    }

    @GetMapping("/kakao/callback")
    ResponseEntity<Void> callback(@RequestParam(name = "state", defaultValue = "") String state,
                                  @RequestParam(name = "code", defaultValue = "") String code,
                                  @RequestParam(name = "error", defaultValue = "") String error,
                                  HttpServletRequest request) {
        var session = request.getSession(false);
        var attempt = consumeAttempt(session, state);
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
            request.changeSessionId();
            session.setMaxInactiveInterval((int) SESSION_TIMEOUT.toSeconds());
            session.setAttribute(MEMBER, member);
            return home(attempt.section(), "");
        } catch (IOException | RuntimeException ex) {
            LOG.warn("Could not complete the local Kakao sign-in ({})", ex.getClass().getSimpleName());
            return home(attempt.section(), "failed");
        }
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(@RequestHeader(name = "X-Auth-Client", defaultValue = "") String client,
                                HttpServletRequest request) {
        if (!"web".equals(client)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        var expired = ResponseCookie.from(SESSION_COOKIE, "").path(COOKIE_PATH).httpOnly(true)
                .secure(kakao.secureCookie()).sameSite("Lax").maxAge(Duration.ZERO).build();
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, expired.toString()).build();
    }

    private static LoginAttempt consumeAttempt(HttpSession session, String state) {
        if (session == null) return null;
        synchronized (session) {
            var attempt = (LoginAttempt) session.getAttribute(LOGIN_ATTEMPT);
            if (attempt == null || !MessageDigest.isEqual(attempt.state().getBytes(StandardCharsets.UTF_8),
                    state.getBytes(StandardCharsets.UTF_8))) return null;
            session.removeAttribute(LOGIN_ATTEMPT);
            return Instant.now().isBefore(attempt.expiresAt()) ? attempt : null;
        }
    }

    private static String randomValue() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
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
        return redirect(URI.create("/" + (error.isEmpty() ? "" : "?login=" + error) + (section.isEmpty() ? "" : "#" + section)));
    }

    private static ResponseEntity<Void> redirect(URI uri) {
        return ResponseEntity.status(HttpStatus.SEE_OTHER).location(uri).build();
    }
}
