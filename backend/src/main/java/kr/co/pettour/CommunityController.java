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
    private final AuthSessionStore sessions;
    private final MemberStore members;
    public CommunityController(CommunityService service, AuthSessionStore sessions, MemberStore members) { this.service = service; this.sessions = sessions; this.members = members; }
    private String identity(HttpServletRequest request) {
        var member = members.find(sessions.memberId(AuthController.browserToken(request)));
        return member == null ? null : "member:" + member.id();
    }
    public record FlagInput(boolean enabled) {}

    @ModelAttribute
    public void protect(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        if (!Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod()) && !"web".equals(request.getHeader("X-Community-Client")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "앱에서 다시 요청해주세요.");
        if ((!Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod()) || request.getRequestURI().equals("/api/community/points")) && identity(request) == null) {
            response.setHeader("X-Auth-Required", "1");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 후 이용해주세요.");
        }
    }
    @GetMapping("/profile") public Map<String, Object> profile(HttpServletRequest request) {
        var result = new HashMap<String, Object>(); result.put("profile", service.me(identity(request))); return result;
    }
    @PostMapping(value="/profile", consumes=MediaType.APPLICATION_JSON_VALUE)
    public Profile saveProfile(HttpServletRequest request, @RequestBody ProfileInput input) {
        return service.saveProfile(identity(request), input);
    }
    @GetMapping("/courses") public Feed courses(HttpServletRequest request,
        @RequestParam(defaultValue="") String region, @RequestParam(defaultValue="") String keyword, @RequestParam(defaultValue="") String dog,
        @RequestParam(defaultValue="recent") String sort, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="false") boolean mine) {
        var member = members.find(sessions.memberId(AuthController.browserToken(request)));
        if (!dog.isEmpty() && member == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var preferences = dog.isEmpty() ? null : members.dog(member, dog);
        return service.feed(identity(request), region, keyword, sort, page, mine, preferences);
    }
    @GetMapping("/courses/{id}") public CourseView detail(HttpServletRequest request, @PathVariable String id) { return service.detail(identity(request), id); }
    @PostMapping(value="/courses", consumes=MediaType.APPLICATION_JSON_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public CourseView create(HttpServletRequest request, @RequestBody CourseInput input) { return service.create(identity(request), input); }
    @PutMapping(value="/courses/{id}", consumes=MediaType.APPLICATION_JSON_VALUE)
    public CourseView update(HttpServletRequest request, @PathVariable String id, @RequestBody CourseInput input) { return service.update(identity(request), id, input); }
    @DeleteMapping("/courses/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(HttpServletRequest request, @PathVariable String id) { service.delete(identity(request), id); }
    @PutMapping(value="/courses/{id}/like", consumes=MediaType.APPLICATION_JSON_VALUE)
    public CourseView like(HttpServletRequest request, @PathVariable String id, @RequestBody FlagInput input) { return service.like(identity(request), id, input.enabled()); }
    @GetMapping("/points") public PointsView points(HttpServletRequest request) { return service.points(identity(request)); }
    @PutMapping(value="/nfc/proximity", consumes=MediaType.APPLICATION_JSON_VALUE)
    public PointsView nfcProximity(HttpServletRequest request, @RequestBody FlagInput input) { return service.nfcProximity(identity(request), input.enabled()); }
    @PostMapping("/nfc/heartbeat")
    public PointsView nfcHeartbeat(HttpServletRequest request) { return service.nfcHeartbeat(identity(request)); }
    @PostMapping(value="/shares", consumes=MediaType.APPLICATION_JSON_VALUE)
    public SharedTripView createShare(HttpServletRequest request, @RequestBody ShareInput input) { return service.createShare(identity(request), input); }
    @GetMapping("/shares/{id}") public SharedTripView sharedTrip(@PathVariable String id) { return service.sharedTrip(id); }
    @PutMapping("/shares/{id}/complete")
    public ShareReward completeShare(HttpServletRequest request, @PathVariable String id) { return service.completeShare(identity(request), id); }
}
