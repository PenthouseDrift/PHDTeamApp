/** Slim member record for the check-in desk (no wallet, discounts or counters). */
export interface RosterMember {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  image: string | null;
  role: string;
}

export function isStaffRole(role: string): boolean {
  return role === "admin" || role === "moderator";
}

/** £10 not £10.00; £7.50 stays £7.50. */
export function money(amount: number): string {
  return `£${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export interface MethodInfo {
  label: string;
  /** Tailwind classes for the pill. */
  tone: string;
}

const GREEN = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
const AMBER = "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
const BLUE = "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
const PURPLE = "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300";
const ZINC = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

/** Human labels for stored check-in methods (every method gets its own label). */
export function methodInfo(method: string): MethodInfo {
  switch (method) {
    case "membership":
      return { label: "Membership", tone: GREEN };
    case "membership_cash":
      return { label: "New membership", tone: PURPLE };
    case "qr":
      return { label: "QR scan", tone: GREEN };
    case "self_checkin":
      return { label: "Self check-in", tone: BLUE };
    case "manual":
      return { label: "Track access", tone: GREEN };
    case "day_pass":
    case "day_pass_wallet":
      return { label: "Day pass · wallet", tone: AMBER };
    case "day_pass_cash":
      return { label: "Day pass · cash", tone: AMBER };
    case "rental":
    case "rental_wallet":
      return { label: "Car rental · wallet", tone: BLUE };
    case "rental_cash":
      return { label: "Car rental · cash", tone: BLUE };
    default:
      return { label: method.replace(/_/g, " "), tone: ZINC };
  }
}

export const EDITABLE_METHODS: Array<{ value: string; label: string }> = [
  { value: "manual", label: "Track access" },
  { value: "qr", label: "QR scan" },
  { value: "day_pass_wallet", label: "Day pass · wallet" },
  { value: "day_pass_cash", label: "Day pass · cash" },
  { value: "rental_wallet", label: "Car rental · wallet" },
  { value: "rental_cash", label: "Car rental · cash" },
  { value: "membership_cash", label: "New membership" },
];
