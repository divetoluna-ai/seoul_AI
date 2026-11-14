package kr.co.pettour;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@RestController
@RequestMapping("/api/auth/avatar")
class AvatarController {
    record SavedDesign(JsonNode design) {}
    private final AuthController auth;
    private final MemberStore members;
    private final CommunityService community;
    private final AvatarDesignStore store;
    AvatarController(AuthController auth, MemberStore members, CommunityService community, AvatarDesignStore store) {
        this.auth = auth; this.members = members; this.community = community; this.store = store;
    }

    @ModelAttribute
    void protect(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        auth.requireMember(request);
        if (!request.getMethod().equals("GET") && !request.getMethod().equals("HEAD")
                && !"web".equals(request.getHeader("X-Auth-Client"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    @GetMapping
    SavedDesign load(@RequestParam String pet, HttpServletRequest request) {
        var member = auth.requireMember(request);
        String name = petName(member, pet);
        var design = store.find(member.id(), pet);
        if (design instanceof ObjectNode object) object.put("name", name);
        return new SavedDesign(design);
    }

    @PutMapping
    SavedDesign save(@RequestParam String pet, @RequestBody JsonNode design, HttpServletRequest request) {
        var member = auth.requireMember(request);
        String name = petName(member, pet);
        if (!(design instanceof ObjectNode object)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        object.put("name", name);
        return new SavedDesign(store.save(member.id(), pet, object));
    }

    private String petName(MemberStore.Member member, String pet) {
        if (pet.startsWith("dog:")) {
            String name = members.dog(member, pet.substring(4)).name();
            if (name != null && !name.isBlank()) return name;
        } else if (pet.startsWith("profile:")) {
            var profile = community.me("member:" + member.id());
            if (profile != null && pet.equals("profile:" + profile.id()) && !profile.petName().isBlank()) return profile.petName();
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "등록한 반려동물을 찾지 못했어요.");
    }
}
