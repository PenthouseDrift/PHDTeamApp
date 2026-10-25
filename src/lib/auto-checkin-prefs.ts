/**
 * Auto check-in preferences. Two independent settings on the member record:
 *   autoCheckInDayPass, autoCheckInRental
 * Each is true, false, or UNSET (null = the member hasn't been asked/decided
 * yet, which is what triggers the first-run prompt). Pure, so client components
 * can import it.
 */
export type AutoCheckInPref = boolean | null;

export interface AutoCheckInPrefs {
  dayPass: AutoCheckInPref;
  rental: AutoCheckInPref;
}

export const AUTO_CHECKIN_FIELDS = {
  dayPass: "autoCheckInDayPass",
  rental: "autoCheckInRental",
} as const;

/** Redis hands booleans back as booleans or strings depending on how they were stored. */
function toPref(value: unknown): AutoCheckInPref {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

export function parseAutoCheckInPrefs(member: Record<string, unknown> | null | undefined): AutoCheckInPrefs {
  return {
    dayPass: toPref(member?.[AUTO_CHECKIN_FIELDS.dayPass]),
    rental: toPref(member?.[AUTO_CHECKIN_FIELDS.rental]),
  };
}
