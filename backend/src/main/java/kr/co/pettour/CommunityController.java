package kr.co.pettour;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static kr.co.pettour.CommunityService.*;

@RestController
@RequestMapping("/api/community")
public class CommunityController {
    private final CommunityService service;
    public CommunityController(CommunityService service) { this.service = service; }
    public record FlagInput(boolean enabled) {}

    @ModelAttribute
    public void protect(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        if (!Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod()) && !"web".equals(request.getHeader("X-Community-Client")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "앱에서 다시 요청해주세요.");
    }
    @GetMapping("/profile") public Map<String, Object> profile(@CookieValue(name="daeng-community", required=false) String token) {
        var result = new HashMap<String, Object>(); result.put("profile", service.me(token)); return result;
    }
    @PostMapping(value="/profile", consumes=MediaType.APPLICATION_JSON_VALUE)
    public Profile saveProfile(@CookieValue(name="daeng-community", required=false) String token, @RequestBody ProfileInput input, HttpServletRequest request, HttpServletResponse response) {
        if (service.me(token) == null) token = UUID.randomUUID() + "-" + UUID.randomUUID();
        var profile = service.saveProfile(token, input);
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("daeng-community", token).httpOnly(true).secure(request.isSecure())
            .sameSite("Strict").path("/api/community").maxAge(java.time.Duration.ofDays(365)).build().toString());
        return profile;
    }
    @GetMapping("/courses") public Feed courses(@CookieValue(name="daeng-community", required=false) String token,
        @RequestParam(defaultValue="") String region, @RequestParam(defaultValue="") String keyword,
        @RequestParam(defaultValue="recent") String sort, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="false") boolean mine) {
        return service.feed(token, region, keyword, sort, page, mine);
    }
    @GetMapping("/courses/{id}") public CourseView detail(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { return service.detail(token, id); }
    @PostMapping(value="/courses", consumes=MediaType.APPLICATION_JSON_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public CourseView create(@CookieValue(name="daeng-community", required=false) String token, @RequestBody CourseInput input) { return service.create(token, input); }
    @PutMapping(value="/courses/{id}", consumes=MediaType.APPLICATION_JSON_VALUE)
    public CourseView update(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody CourseInput input) { return service.update(token, id, input); }
    @DeleteMapping("/courses/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { service.delete(token, id); }
    @PutMapping(value="/courses/{id}/like", consumes=MediaType.APPLICATION_JSON_VALUE)
    public CourseView like(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody FlagInput input) { return service.like(token, id, input.enabled()); }
}
