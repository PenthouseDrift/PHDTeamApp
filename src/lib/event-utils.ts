export type EventTimingState = "happening_now" | "today" | "upcoming" | "finished" | "cancelled";

export interface EventTimingInfo {
  state: EventTimingState;
  label: string;
  badgeBg: string;
  badgeText: string;
  dotColor?: string;
  animateDot?: boolean;
}

/** Member self check-in opens this many minutes before an event's opening time. */
export const SELF_CHECKIN_LEAD_MINUTES = 30;

/**
 * Whether member self check-in is open for this event right now: from
 * SELF_CHECKIN_LEAD_MINUTES before the event opens until it closes. The event's
 * own timing state (badges, "Happening Now") is unchanged; this only widens the
 * check-in window. Same-day only, so the lead time is clamped at midnight.
 */
export function isSelfCheckInWindowOpen(event: {
  date: string;
  openTime?: string;
  closeTime?: string;
  time?: string;
  status?: string;
}): boolean {
  const timing = getEventTiming(event);
  if (timing.state === "happening_now") return true;
  // Before the event opens, only today's events can be in the early window.
  if (timing.state !== "today") return false;

  let openMin = -1;
  if (event.openTime) {
    const [h, m] = event.openTime.split(":").map(Number);
    if (!isNaN(h)) openMin = h * 60 + (m || 0);
  }
  if (openMin === -1 && event.time) {
    const match = event.time.match(/(\d{1,2}):(\d{2})/);
    if (match) openMin = parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  // No usable open time: keep the original behaviour (not open before the event starts).
  if (openMin === -1) return false;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= openMin - SELF_CHECKIN_LEAD_MINUTES && currentMinutes < openMin;
}

export function getEventTiming(event: {
  date: string;
  openTime?: string;
  closeTime?: string;
  time?: string;
  status?: string;
}): EventTimingInfo {
  if (event.status === "cancelled") {
    return {
      state: "cancelled",
      label: "Cancelled",
      badgeBg: "bg-red-500/15 border border-red-500/30",
      badgeText: "text-red-600 dark:text-red-400 font-bold",
    };
  }

  // Calculate current date & time explicitly in Europe/London timezone (UK Track)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach((p) => {
    partMap[p.type] = p.value;
  });

  const localToday = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const currentHour = parseInt(partMap.hour || "0", 10);
  const currentMinute = parseInt(partMap.minute || "0", 10);
  const currentMinutes = currentHour * 60 + currentMinute;

  const eventDate = event.date;

  if (eventDate < localToday) {
    return {
      state: "finished",
      label: "Finished",
      badgeBg: "bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700",
      badgeText: "text-zinc-600 dark:text-zinc-400 font-bold",
    };
  }

  if (eventDate > localToday) {
    return {
      state: "upcoming",
      label: "Upcoming",
      badgeBg: "bg-amber-500/15 border border-amber-500/30",
      badgeText: "text-amber-600 dark:text-amber-400 font-black",
    };
  }

  // Event is TODAY
  let openMin = -1;
  let closeMin = -1;

  if (event.openTime) {
    const [h, m] = event.openTime.split(":").map(Number);
    if (!isNaN(h)) openMin = h * 60 + (m || 0);
  }
  if (event.closeTime) {
    const [h, m] = event.closeTime.split(":").map(Number);
    if (!isNaN(h)) closeMin = h * 60 + (m || 0);
  }

  // Fallback parsing from time string if openTime/closeTime not explicitly provided
  if (openMin === -1 && event.time) {
    const match = event.time.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      openMin = parseInt(match[1]) * 60 + parseInt(match[2]);
    }
  }

  // If closeTime wasn't specified, assume standard 8-hour session length
  if (openMin !== -1 && closeMin === -1) {
    closeMin = openMin + 8 * 60;
  }

  if (openMin !== -1 && closeMin !== -1) {
    if (currentMinutes < openMin) {
      return {
        state: "today",
        label: "Happening Today",
        badgeBg: "bg-amber-500 text-black font-black",
        badgeText: "text-black",
        dotColor: "bg-black",
        animateDot: false,
      };
    } else if (currentMinutes >= openMin && currentMinutes <= closeMin) {
      return {
        state: "happening_now",
        label: "Happening Now",
        badgeBg: "bg-emerald-500 text-black font-black shadow-sm",
        badgeText: "text-black",
        dotColor: "bg-white",
        animateDot: true,
      };
    } else {
      return {
        state: "finished",
        label: "Finished Today",
        badgeBg: "bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700",
        badgeText: "text-zinc-600 dark:text-zinc-400 font-bold",
      };
    }
  }

  return {
    state: "today",
    label: "Happening Today",
    badgeBg: "bg-amber-500 text-black font-black",
    badgeText: "text-black",
    dotColor: "bg-black",
    animateDot: true,
  };
}
