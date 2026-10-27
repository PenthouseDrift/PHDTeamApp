/**
 * Navigation model for the admin/mod portal when the signed-in staff member has
 * the "New dashboard" option on. Pure data + functions (no server imports) so
 * the client shell can use it.
 *
 * Tabs, in the order a track day actually flows:
 *   Today     – the live overview and the big "Check someone in" action
 *   Check in  – the check-in desk (search, check in, today's list, rentals)
 *   Members   – look people up, memberships, wallet, discounts
 *   Reports   – revenue, activity log, history, payouts (admin only)
 *   More      – everything else (marketplace, click & collect, events, notes...)
 *
 * Deeper pages show a Back button to a fixed parent, never browser history.
 */

export type AdminTabKey = "today" | "checkin" | "members" | "reports" | "more";

export interface AdminTab {
  key: AdminTabKey;
  label: string;
  href: string;
  adminOnly?: boolean;
}

export const ADMIN_TABS: AdminTab[] = [
  { key: "today", label: "Today", href: "/admin" },
  { key: "checkin", label: "Check in", href: "/admin/check-in" },
  { key: "members", label: "Members", href: "/admin/members" },
  { key: "reports", label: "Reports", href: "/admin/activity", adminOnly: true },
  { key: "more", label: "More", href: "/admin/more" },
];

export function adminTabsFor(role: string | undefined): AdminTab[] {
  return ADMIN_TABS.filter((t) => !t.adminOnly || role === "admin");
}

function normalize(pathname: string): string {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function adminTabForPath(pathname: string): AdminTabKey {
  const p = normalize(pathname);
  if (p === "/admin") return "today";
  if (p.startsWith("/admin/check-in")) return "checkin";
  if (p.startsWith("/admin/members") || p.startsWith("/admin/users")) return "members";
  if (
    p.startsWith("/admin/activity") ||
    p.startsWith("/admin/history") ||
    p.startsWith("/admin/facilitated-sales") ||
    p.startsWith("/admin/asbo-rc")
  ) {
    return "reports";
  }
  return "more";
}

const ROOT_PATHS = new Set(["/admin", "/admin/check-in", "/admin/members", "/admin/activity", "/admin/more"]);

export function isAdminRoot(pathname: string): boolean {
  return ROOT_PATHS.has(normalize(pathname));
}

const BACK_RULES: Array<[RegExp, string]> = [
  [/^\/admin\/activity\/revenue\/(monthly|concessions)$/, "/admin/activity/revenue"],
  [/^\/admin\/activity\/.+$/, "/admin/activity"],
  [/^\/admin\/(history|facilitated-sales|asbo-rc)$/, "/admin/activity"],
  [/^\/admin\/users$/, "/admin/members"],
];

export function adminBackFor(pathname: string): string {
  const p = normalize(pathname);
  for (const [re, to] of BACK_RULES) if (re.test(p)) return to;
  // events, notes, notifications, showcase-winners, facebook, gallery, click-collect
  return "/admin/more";
}

const TITLES: Array<[string, string]> = [
  ["/admin/check-in", "Check in"],
  ["/admin/members", "Members"],
  ["/admin/users", "Members"],
  ["/admin/activity/revenue/monthly", "Monthly revenue"],
  ["/admin/activity/revenue/concessions", "Concessions"],
  ["/admin/activity/revenue", "Today's revenue"],
  ["/admin/activity/log", "Activity log"],
  ["/admin/activity", "Reports"],
  ["/admin/history", "Check-in history"],
  ["/admin/facilitated-sales", "Facilitated sales"],
  ["/admin/asbo-rc", "ASBO-RC"],
  ["/admin/click-collect", "Click & Collect"],
  ["/admin/events", "Events"],
  ["/admin/notes", "Notes"],
  ["/admin/card-maker", "Card maker"],
  ["/admin/member-cards", "Member cards"],
  ["/admin/notifications", "Global alerts"],
  ["/admin/showcase-winners", "Winners"],
  ["/admin/facebook", "Facebook"],
  ["/admin/gallery", "Website gallery"],
  ["/admin/more", "More"],
];

export function adminTitleFor(pathname: string): string {
  const p = normalize(pathname);
  if (p === "/admin") return "Today";
  return TITLES.find(([prefix]) => p === prefix || p.startsWith(prefix + "/"))?.[1] ?? "Staff";
}
