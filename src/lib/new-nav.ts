/**
 * Navigation model for the NEW member experience (the shell a member gets when
 * they switch on "New dashboard" in Profile). Pure data + functions with no
 * server imports, so it's safe to use from client components.
 *
 * Information architecture (5 tabs):
 *   Home    – check in, events, guest check-in
 *   Garage  – My Cars, Cards, Tuning Advisor, Gear Calculator (+ shared setups)
 *   Passes  – membership, day passes, rental hours (buy + balances)
 *   Market  – browse, my listings, orders (+ basket in the top bar)
 *   Menu    – profile, showcase, share, QR, reports/admin, switch back, sign out
 *
 * Every existing page lives under exactly one tab, so a member always knows
 * where they are. Top-level pages show the tab bar; deeper pages show a Back
 * button that goes to a fixed parent (NOT browser history, which breaks after a
 * payment redirect or a deep link).
 */

export type TabKey = "home" | "garage" | "passes" | "market" | "menu";

export interface NavTab {
  key: TabKey;
  label: string;
  href: string;
}

export const NEW_TABS: NavTab[] = [
  { key: "home", label: "Home", href: "/dashboard2" },
  { key: "garage", label: "Garage", href: "/cars" },
  { key: "passes", label: "Passes", href: "/dashboard2/passes" },
  { key: "market", label: "Market", href: "/marketplace" },
  { key: "menu", label: "Menu", href: "/dashboard2/menu" },
];

export interface SectionChip {
  label: string;
  href: string;
}

/** Secondary navigation shown under the top bar on a section's top-level pages. */
export const GARAGE_CHIPS: SectionChip[] = [
  { label: "My cars", href: "/cars" },
  { label: "Cards", href: "/cards" },
  { label: "Tuning advisor", href: "/tuning-advisor" },
  { label: "Gear calculator", href: "/calculator" },
];

export const MARKET_CHIPS: SectionChip[] = [
  { label: "Browse", href: "/marketplace" },
  { label: "My listings", href: "/marketplace/mine" },
  { label: "Orders", href: "/orders" },
];

function normalize(pathname: string): string {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Which tab a URL belongs to. */
export function tabForPath(pathname: string): TabKey {
  const p = normalize(pathname);
  if (p.startsWith("/dashboard2/passes") || p.startsWith("/wallet") || p.startsWith("/membership")) {
    return "passes";
  }
  if (
    p.startsWith("/dashboard2/menu") ||
    p.startsWith("/profile") ||
    p.startsWith("/showcase") ||
    p.startsWith("/asbo-rc") ||
    p.startsWith("/more") ||
    p.startsWith("/notifications")
  ) {
    return "menu";
  }
  if (
    p.startsWith("/cars") ||
    p.startsWith("/cards") ||
    p.startsWith("/calculator") ||
    p.startsWith("/tuning") || // also covers /tuning-advisor
    p.startsWith("/share")
  ) {
    return "garage";
  }
  if (p.startsWith("/marketplace") || p.startsWith("/orders")) {
    return "market";
  }
  // /dashboard2, /dashboard2/events, /dashboard2/guest, /track-checkin, /dashboard
  return "home";
}

/** Chips for this URL, or null. Only shown on a section's top-level pages. */
export function chipsFor(pathname: string): SectionChip[] | null {
  const p = normalize(pathname);
  if (GARAGE_CHIPS.some((c) => c.href === p) || p === "/tuning") return GARAGE_CHIPS;
  if (MARKET_CHIPS.some((c) => c.href === p)) return MARKET_CHIPS;
  return null;
}

/** Top-level pages: no Back button (they're reachable from the tab bar / chips). */
const ROOT_PATHS = new Set([
  "/dashboard2",
  "/dashboard2/passes",
  "/dashboard2/menu",
  "/cars",
  "/cards",
  "/tuning",
  "/tuning-advisor",
  "/calculator",
  "/marketplace",
  "/marketplace/mine",
  "/orders",
]);

export function isRootPath(pathname: string): boolean {
  return ROOT_PATHS.has(normalize(pathname));
}

/** Fixed parent for pages that don't follow "strip the last segment". */
const BACK_RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/cars\/([^/]+)\/calibrations(\/.*)?$/, (m) => `/cars/${m[1]}`],
  [/^\/marketplace\/purchase(\/.*)?$/, () => "/orders"],
  [/^\/marketplace\/basket$/, () => "/marketplace"],
  [/^\/membership(\/.*)?$/, () => "/dashboard2/passes"],
  [/^\/wallet$/, () => "/dashboard2/passes"],
  [/^\/share\/.+$/, () => "/cars"],
  [/^\/showcase\/.+$/, () => "/showcase"],
  [/^\/(profile|showcase|asbo-rc|more|notifications)$/, () => "/dashboard2/menu"],
  [/^\/track-checkin$/, () => "/dashboard2"],
];

/** Where the Back button goes from this page. */
export function backFor(pathname: string): string {
  const p = normalize(pathname);
  for (const [re, to] of BACK_RULES) {
    const m = p.match(re);
    if (m) return to(m);
  }
  const parent = p.split("/").slice(0, -1).join("/");
  return parent || "/dashboard2";
}

/** Short title for the top bar (pages keep their own detailed <h1>). */
export function titleFor(pathname: string): string {
  const p = normalize(pathname);
  if (p === "/dashboard2") return "Home";
  if (p.startsWith("/dashboard2/events")) return "Events";
  if (p.startsWith("/dashboard2/guest")) return "Guest check-in";
  if (p.startsWith("/track-checkin")) return "Check in";
  if (p === "/cards") return "My cards";
  if (p.startsWith("/cards/new")) return "Open a pack";
  if (p.startsWith("/profile")) return "Profile";
  if (p.startsWith("/showcase")) return "Showcase";
  if (p.startsWith("/asbo-rc")) return "ASBO-RC reports";
  if (p.startsWith("/membership")) return "Membership";
  const tab = NEW_TABS.find((t) => t.key === tabForPath(p));
  return tab ? (tab.key === "market" ? "Marketplace" : tab.label) : "Penthouse Drift";
}
