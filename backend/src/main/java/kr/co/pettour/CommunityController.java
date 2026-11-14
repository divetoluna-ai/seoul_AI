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
    public record TextInput(String content) {}
    public record FlagInput(boolean enabled) {}
    public record StatusInput(String status) {}
    public record StartInput(String postId) {}

    // A custom header blocks cross-origin form requests; no community CORS is enabled.
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
    @GetMapping("/posts") public Feed posts(@CookieValue(name="daeng-community", required=false) String token,
        @RequestParam(defaultValue="all") String category, @RequestParam(defaultValue="") String region,
        @RequestParam(defaultValue="") String district, @RequestParam(defaultValue="") String keyword,
        @RequestParam(defaultValue="recent") String sort, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="false") boolean mine) {
        return service.feed(token, category, region, district, keyword, sort, page, mine);
    }
    @GetMapping("/points") public PointsView points(@CookieValue(name="daeng-community", required=false) String token) { return service.points(token); }
    @PutMapping(value="/nfc/proximity", consumes=MediaType.APPLICATION_JSON_VALUE)
    public PointsView nfcProximity(@CookieValue(name="daeng-community", required=false) String token, @RequestBody FlagInput input) { return service.nfcProximity(token, input.enabled()); }
    @PostMapping("/nfc/heartbeat")
    public PointsView nfcHeartbeat(@CookieValue(name="daeng-community", required=false) String token) { return service.nfcHeartbeat(token); }
    @PostMapping(value="/shares", consumes=MediaType.APPLICATION_JSON_VALUE)
    public SharedTripView createShare(@CookieValue(name="daeng-community", required=false) String token, @RequestBody ShareInput input) { return service.createShare(token, input); }
    @GetMapping("/shares/{id}") public SharedTripView sharedTrip(@PathVariable String id) { return service.sharedTrip(id); }
    @PutMapping("/shares/{id}/complete")
    public ShareReward completeShare(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { return service.completeShare(token, id); }
    @GetMapping("/posts/{id}") public DetailView detail(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { return service.detail(token, id); }
    @PostMapping(value="/posts", consumes=MediaType.APPLICATION_JSON_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public DetailView create(@CookieValue(name="daeng-community", required=false) String token, @RequestBody PostInput input) { return service.create(token, input); }
    @DeleteMapping("/posts/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { service.deletePost(token, id); }
    @PutMapping(value="/posts/{id}/like", consumes=MediaType.APPLICATION_JSON_VALUE)
    public DetailView like(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody FlagInput input) { return service.like(token, id, input.enabled()); }
    @PutMapping(value="/posts/{id}/join", consumes=MediaType.APPLICATION_JSON_VALUE)
    public DetailView join(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody FlagInput input) { return service.join(token, id, input.enabled()); }
    @PutMapping(value="/posts/{id}/status", consumes=MediaType.APPLICATION_JSON_VALUE)
    public DetailView status(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody StatusInput input) { return service.status(token, id, input.status()); }
    @PostMapping(value="/posts/{id}/comments", consumes=MediaType.APPLICATION_JSON_VALUE)
    public DetailView comment(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody TextInput input) { return service.comment(token, id, input.content()); }
    @DeleteMapping("/posts/{id}/comments/{commentId}")
    public DetailView deleteComment(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @PathVariable String commentId) { return service.deleteComment(token, id, commentId); }
    @GetMapping("/conversations") public List<ConversationView> conversations(@CookieValue(name="daeng-community", required=false) String token) { return service.conversations(token); }
    @PostMapping(value="/conversations", consumes=MediaType.APPLICATION_JSON_VALUE)
    public ConversationDetail start(@CookieValue(name="daeng-community", required=false) String token, @RequestBody StartInput input) { return service.startConversation(token, input.postId()); }
    @GetMapping("/conversations/{id}") public ConversationDetail messages(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id) { return service.messages(token, id); }
    @PostMapping(value="/conversations/{id}/messages", consumes=MediaType.APPLICATION_JSON_VALUE)
    public ConversationDetail send(@CookieValue(name="daeng-community", required=false) String token, @PathVariable String id, @RequestBody TextInput input) { return service.send(token, id, input.content()); }
}
