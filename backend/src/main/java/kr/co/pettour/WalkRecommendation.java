package kr.co.pettour;

import java.util.Comparator;

/** Ranks shared courses using their estimated duration and the user's walking preferences. */
record WalkRecommendation(Integer maxMinutes, Integer preferredMinutes, Order order) {
    enum Order { SHORTER, CLOSEST_TO_PREFERENCE }
    enum TimeMatch { WITHIN_LIMIT, OVER_LIMIT, NO_LIMIT, UNKNOWN }

    record Assessment(Integer minutes, Integer maxMinutes, TimeMatch time) {
        boolean eligible(boolean timeUnknown) {
            return time != TimeMatch.OVER_LIMIT && (time == TimeMatch.UNKNOWN) == timeUnknown;
        }
    }

    Comparator<Assessment> ranking() {
        return Comparator.comparingInt(this::durationRank);
    }

    private int durationRank(Assessment assessment) {
        Integer minutes = assessment.minutes();
        if (minutes == null) return 0;
        if (order == Order.CLOSEST_TO_PREFERENCE && preferredMinutes != null)
            return Math.abs(minutes - preferredMinutes);
        return minutes;
    }

    static WalkRecommendation forDog(MemberStore.DogProfile dog, Integer overrideMinutes, Order order) {
        Integer preferredMinutes = validMinutes(dog.walkMinutes()) ? dog.walkMinutes() : null;
        Integer maxMinutes = overrideMinutes != null ? overrideMinutes : preferredMinutes;
        return new WalkRecommendation(maxMinutes, preferredMinutes, order);
    }

    static boolean validMinutes(Integer minutes) {
        return minutes != null && minutes >= 1 && minutes <= 600;
    }

    Assessment assess(CommunityService.WalkConditions walk) {
        Integer minutes = walk != null && validMinutes(walk.minutes()) ? walk.minutes() : null;
        return new Assessment(minutes, maxMinutes, timeMatch(minutes));
    }

    private TimeMatch timeMatch(Integer minutes) {
        if (minutes == null) return TimeMatch.UNKNOWN;
        if (maxMinutes == null) return TimeMatch.NO_LIMIT;
        return minutes <= maxMinutes ? TimeMatch.WITHIN_LIMIT : TimeMatch.OVER_LIMIT;
    }
}
