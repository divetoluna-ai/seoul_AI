package kr.co.pettour;

import org.jsoup.parser.Parser;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;
import static kr.co.pettour.Models.*;

/** One set of eligibility rules for source imports, list pages and direct detail URLs. */
final class PlaceQuality {
    private static final Set<String> ALLOWED = new HashSet<>();
    private static final List<Pattern> INVALID = new ArrayList<>(), BLOCKED = new ArrayList<>();
    private static final Map<String, List<Pattern>> CATEGORY = new HashMap<>();
    private static final Pattern PET_CARE, HUMAN_BEAUTY;
    static {
        try (var input = new ClassPathResource("data/place-quality-rules.json").getInputStream()) {
            var rules = JsonMapper.builder().build().readTree(input);
            PET_CARE = pattern(rules.path("petCareNamePattern").asText());
            HUMAN_BEAUTY = pattern(rules.path("humanBeautyNamePattern").asText());
            rules.path("allowedCategories").forEach(n -> ALLOWED.add(n.asText()));
            rules.path("invalidNamePatterns").forEach(n -> INVALID.add(pattern(n.asText())));
            rules.path("blockedNamePatterns").forEach(n -> BLOCKED.add(pattern(n.asText())));
            for (String category : ALLOWED) {
                var patterns = new ArrayList<Pattern>();
                rules.path("categoryNamePatterns").path(category).forEach(n -> patterns.add(pattern(n.asText())));
                CATEGORY.put(category, patterns);
            }
        } catch (Exception ex) { throw new ExceptionInInitializerError(ex); }
    }
    private static Pattern pattern(String regex) { return Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE); }
    static String displayName(String raw) {
        return Normalizer.normalize(Parser.unescapeEntities(Objects.requireNonNullElse(raw, ""), false), Normalizer.Form.NFKC).replaceAll("\\s+", " ").strip();
    }
    static String exclusionReason(String raw, String category) {
        if (!ALLOWED.contains(category)) return "unrelated_category";
        String name = displayName(raw);
        if (name.isBlank() || name.length() > 200 || name.codePoints().noneMatch(Character::isLetterOrDigit)) return "invalid_name";
        String original = Objects.requireNonNullElse(raw, "");
        if (INVALID.stream().anyMatch(p -> p.matcher(original).find() || p.matcher(name).find())) return "invalid_name";
        if (BLOCKED.stream().anyMatch(p -> p.matcher(name).find()) || CATEGORY.getOrDefault(category, List.of()).stream().anyMatch(p -> p.matcher(name).find())) return "unrelated_business";
        if (category.equals("shopping") && HUMAN_BEAUTY.matcher(name).find() && !PET_CARE.matcher(name).find()) return "unrelated_business";
        return "";
    }
    static boolean allowed(Place place) { return exclusionReason(place.name(), place.category()).isEmpty(); }
    static Place clean(Place p) {
        String name = displayName(p.name());
        String category = p.category().equals("shopping") && PET_CARE.matcher(name).find() && HUMAN_BEAUTY.matcher(name).find() ? "care" : p.category();
        return name.equals(p.name()) && category.equals(p.category()) ? p : new Place(p.id(), name, category, p.address(), p.image(), p.phone(), p.longitude(), p.latitude(),
            p.modified(), p.source(), p.imageSource(), p.imagePage(), p.imageCollectedAt());
    }
}
