/**
 * How long the "already checked in" marker (`checkin:dedup:<id>`) should last: until the end of today
 * in the club's time zone. A fixed 24 hours let a check-in from yesterday afternoon count as "checked
 * in" well into today's event.
 */
const CLUB_TIME_ZONE = "Europe/London";

export function checkInDedupTtlSeconds(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  // At least a minute, so a check-in just before midnight is still de-duplicated.
  return Math.max(60, Math.min(90000, 86400 - secondsIntoDay));
}
