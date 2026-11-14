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
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
class AuthController {
    static final String SESSION_COOKIE = "daeng-session";
    static final String COOKIE_PATH = "/api";
    private static final String LEGACY_COOKIE_PATH = "/api/auth";
    private static final Logger LOG = LoggerFactory.getLogger(AuthController.class);

    record SessionInfo(boolean enabled, String loginOrigin, MemberStore.Member user, boolean dogSetupPending) {}

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
    SessionInfo session(HttpServletRequest request, HttpServletResponse response) {
        String token = browserToken(request);
        var session = sessions.find(token);
        var member = session == null ? null : members.find(session.memberId());
        if (member != null) {
            // Existing cookies at /api/auth also need to reach the protected course filter.
            var remaining = Duration.ofMillis(session.expiresAt() - System.currentTimeMillis());
            response.addHeader(HttpHeaders.SET_COOKIE, cookie(token, remaining.isNegative() ? Duration.ZERO : remaining));
            response.addHeader(HttpHeaders.SET_COOKIE, expiredLegacyCookie());
        }
        boolean pending = member != null && Boolean.TRUE.equals(session.dogSetupPending())
                && members.showDogSetup(member);
        return new SessionInfo(kakao.enabled(), kakao.origin(), member, pending);
    }

    MemberStore.Member requireMember(HttpServletRequest request) {
        var member = members.find(sessions.memberId(browserToken(request)));
        if (member == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return member;
    }

    @GetMapping("/dogs")
    List<MemberStore.DogProfile> dogs(HttpServletRequest request) {
        return members.dogs(requireMember(request));
    }

    @PostMapping(value = "/dogs", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    MemberStore.DogProfile createDog(@RequestBody MemberStore.DogInput input,
                                     @RequestParam(defaultValue = "false") boolean hideSetup, HttpServletRequest request) {
        var dog = saveDog(null, input, hideSetup, request);
        try {
            sessions.completeDogSetup(browserToken(request));
        } catch (ResponseStatusException ex) {
            // The profile is already saved, so returning an error here could cause duplicate submissions.
            LOG.warn("Could not mark the dog setup prompt complete for this session");
        }
        return dog;
    }

    @PostMapping("/dogs/skip-setup")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void skipDogSetup(@RequestParam(defaultValue = "false") boolean hideSetup, HttpServletRequest request) {
        protect(request.getHeader("X-Auth-Client"));
        var member = requireMember(request);
        if (hideSetup) {
            try {
                members.hideDogSetup(member);
            } catch (IOException ex) {
                LOG.warn("Could not save dog setup preference ({})", ex.getClass().getSimpleName());
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "등록 안내 설정을 저장하지 못했어요.");
            }
        }
        sessions.completeDogSetup(browserToken(request));
    }

    @PutMapping(value = "/dogs/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    MemberStore.DogProfile updateDog(@PathVariable String id, @RequestBody MemberStore.DogInput input,
                                     HttpServletRequest request) {
        return saveDog(id, input, false, request);
    }

    private MemberStore.DogProfile saveDog(String id, MemberStore.DogInput input, boolean hideSetup, HttpServletRequest request) {
        protect(request.getHeader("X-Auth-Client"));
        try {
            return members.saveDog(requireMember(request), id, input, hideSetup);
        } catch (IOException ex) {
            LOG.warn("Could not save a dog profile ({})", ex.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "반려견 프로필을 저장하지 못했어요.");
        }
    }

    @DeleteMapping("/dogs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteDog(@PathVariable String id, HttpServletRequest request) {
        protect(request.getHeader("X-Auth-Client"));
        try { members.deleteDog(requireMember(request), id); }
        catch (IOException ex) {
            LOG.warn("Could not delete a dog profile ({})", ex.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "반려견 정보를 삭제하지 못했어요. 다시 시도해주세요.");
        }
    }

    @GetMapping("/kakao")
    ResponseEntity<Void> start(@RequestParam(name = "section", defaultValue = "") String section, HttpServletRequest request) {
        String destination = AuthSessionStore.destination(section);
        if (!kakao.enabled()) return home(destination, "unavailable");

        String previousToken = browserToken(request);
        if (members.find(sessions.memberId(previousToken)) != null) return home(destination, "");
        var attempt = sessions.begin(previousToken, destination);
        return ResponseEntity.status(HttpStatus.SEE_OTHER).location(kakao.authorizationUrl(attempt.state(), challenge(attempt.verifier())))
                .header(HttpHeaders.SET_COOKIE, cookie(attempt.token(), AuthSessionStore.LOGIN_WINDOW), expiredLegacyCookie()).build();
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
            var signIn = members.signIn(user);
            boolean dogPage = "dogs".equals(attempt.section()) || "community/dogs".equals(attempt.section());
            String token = sessions.signIn(signIn.member().id(), signIn.showDogSetup() && !dogPage);
            return ResponseEntity.status(HttpStatus.SEE_OTHER).location(homeUri(attempt.section(), ""))
                    .header(HttpHeaders.SET_COOKIE, cookie(token, AuthSessionStore.SESSION_TIMEOUT), expiredLegacyCookie()).build();
        } catch (IOException | RuntimeException ex) {
            LOG.warn("Could not complete the local Kakao sign-in ({})", ex.getClass().getSimpleName());
            return home(attempt.section(), "failed");
        }
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(@RequestHeader(name = "X-Auth-Client", defaultValue = "") String client,
                                HttpServletRequest request) {
        protect(client);
        sessions.revoke(browserToken(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO), expiredLegacyCookie()).build();
    }

    private static void protect(String client) {
        if (!"web".equals(client)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    static String browserToken(HttpServletRequest request) {
        var cookies = request.getCookies();
        if (cookies != null) for (var cookie : cookies) if (SESSION_COOKIE.equals(cookie.getName())) return cookie.getValue();
        return null;
    }

    private String cookie(String token, Duration lifetime) {
        return cookie(token, lifetime, COOKIE_PATH);
    }

    private String expiredLegacyCookie() {
        return cookie("", Duration.ZERO, LEGACY_COOKIE_PATH);
    }

    private String cookie(String token, Duration lifetime, String path) {
        return ResponseCookie.from(SESSION_COOKIE, token).path(path).httpOnly(true)
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
