/**
 * The set of members whose cards have changed since their Hall of Fame summary was last added up (see leaderboard.ts).
 * Kept in its own tiny file so anything that moves or deletes cards can add to it inside its own Redis transaction without
 * pulling in the whole leaderboard.
 */
export const LB_DIRTY_KEY = "tcg:lb:dirty";
