package kr.co.pettour;

import org.junit.jupiter.api.Test;
import static kr.co.pettour.WalkRecommendation.Order.*;
import static org.junit.jupiter.api.Assertions.*;

class WalkRecommendationTests {
    private static CommunityService.WalkConditions walk(Integer minutes) {
        return new CommunityService.WalkConditions(minutes, null, null, null);
    }

    private static MemberStore.DogProfile dog(Integer minutes) {
        return new MemberStore.DogProfile("dog", null, minutes, false);
    }

    @Test void evaluatesOnlyAvailableCourseData() {
        var criteria = WalkRecommendation.forDog(dog(20), null, SHORTER);
        var boundary = criteria.assess(walk(20));
        var shorter = criteria.assess(walk(15));
        assertEquals(WalkRecommendation.TimeMatch.WITHIN_LIMIT, boundary.time());
        assertTrue(boundary.eligible(false));
        assertTrue(shorter.eligible(false));
        assertTrue(criteria.ranking().compare(shorter, boundary) < 0);
        assertFalse(criteria.assess(walk(21)).eligible(false));
        for (var unknown : new CommunityService.WalkConditions[]{null, walk(null), walk(0)}) {
            var assessment = criteria.assess(unknown);
            assertEquals(WalkRecommendation.TimeMatch.UNKNOWN, assessment.time());
            assertFalse(assessment.eligible(false));
            assertTrue(assessment.eligible(true));
        }
    }

    @Test void profilesWithoutPreferenceCanUseAnExplicitTimeLimit() {
        var profile = dog(null);
        var course = walk(25);
        var criteria = WalkRecommendation.forDog(profile, null, CLOSEST_TO_PREFERENCE);
        var assessment = criteria.assess(course);
        assertEquals(WalkRecommendation.TimeMatch.NO_LIMIT, assessment.time());
        assertTrue(assessment.eligible(false));
        assertTrue(criteria.ranking().compare(criteria.assess(walk(15)), assessment) < 0);
        assertFalse(WalkRecommendation.forDog(profile, 20, CLOSEST_TO_PREFERENCE).assess(course).eligible(false));
    }

    @Test void orderCanSwitchBetweenShorterAndClosest() {
        var shorter = walk(15);
        var longer = walk(20);
        var profile = dog(20);
        var shortFirst = WalkRecommendation.forDog(profile, null, SHORTER);
        var closest = WalkRecommendation.forDog(profile, null, CLOSEST_TO_PREFERENCE);
        assertTrue(shortFirst.ranking().compare(shortFirst.assess(shorter), shortFirst.assess(longer)) < 0);
        assertTrue(closest.ranking().compare(closest.assess(longer), closest.assess(shorter)) < 0);
    }

    @Test void closestOrderUsesPreferenceEvenWhenTheMaximumChanges() {
        var profile = dog(20);
        var criteria = WalkRecommendation.forDog(profile, 35, CLOSEST_TO_PREFERENCE);
        var exact = criteria.assess(walk(20));
        var shorter = criteria.assess(walk(15));
        var longer = criteria.assess(walk(25));
        var nearLimit = criteria.assess(walk(34));
        assertTrue(nearLimit.eligible(false));
        assertTrue(criteria.ranking().compare(exact, nearLimit) < 0);
        assertEquals(0, criteria.ranking().compare(shorter, longer));
        assertFalse(criteria.assess(walk(36)).eligible(false));
        var lowerLimit = WalkRecommendation.forDog(profile, 15, CLOSEST_TO_PREFERENCE);
        assertTrue(lowerLimit.assess(walk(15)).eligible(false));
        assertFalse(lowerLimit.assess(walk(20)).eligible(false));
    }
}
