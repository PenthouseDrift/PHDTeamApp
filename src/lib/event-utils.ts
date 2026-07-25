export type EventTimingState = "happening_now" | "today" | "upcoming" | "finished" | "cancelled";

export interface EventTimingInfo {
  state: EventTimingState;
  label: string;
  badgeBg: string;
  badgeText: string;
  dotColor?: string;
  animateDot?: boolean;
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

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = String(now.getMonth() + 1).padStart(2, "0");
  const nowDate = String(now.getDate()).padStart(2, "0");
  const localToday = `${nowYear}-${nowMonth}-${nowDate}`;

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
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

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
