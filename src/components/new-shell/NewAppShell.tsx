"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useBasket } from "@/components/marketplace/BasketProvider";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { QRPopover } from "@/components/QRPopover";
import { ThemeAppIcon } from "@/components/ThemeAppIcon";
import { PullToRefresh } from "@/components/PullToRefresh";
import { NEW_TABS, backFor, chipsFor, isRootPath, tabForPath, titleFor } from "@/lib/new-nav";
import { ShellIcon, TabIcon, type ShellIconName } from "./shell-icons";

/**
 * App shell for the NEW member experience. It wraps every existing member page
 * (cars, marketplace, calculator, showcase, profile, ...) so they all share one
 * navigation model:
 *   - 5 tabs (Home / Garage / Passes / Market / Menu), bottom bar on mobile and
 *     sidebar on desktop
 *   - a top bar with a deterministic Back button on deeper pages, the page
 *     title, and the always-needed actions (basket, notifications, QR, profile)
 *   - section chips on Garage and Market top-level pages
 * It reuses the classic shell's PWA safe-area classes (pwa-*), PullToRefresh and
 * scroll container, so the app behaves the same on iOS/Android installs.
 */

interface ShellUser {
  id: string;
  name?: string | null;
  image?: string | null;
  role?: "admin" | "moderator" | "member" | "asbo-rc";
}

interface NewAppShellProps {
  user: ShellUser;
  unreadNotifications: number;
  winnerSelectionPending: boolean;
  /** Development build: leave room for the floating dev-tools cog. */
  isDev: boolean;
  /** Active dev impersonation, shown as a strip so it's obvious on every page. */
  impersonation: "member" | "member_active" | null;
  children: React.ReactNode;
}

const EXPLORE_LINKS: { href: string; label: string; icon: ShellIconName }[] = [
  { href: "/cards", label: "My cards", icon: "cards" },
  { href: "/showcase", label: "Shell showcase", icon: "showcase" },
  { href: "/dashboard2/events", label: "Track events", icon: "events" },
  { href: "/dashboard2/guest", label: "Guest check-in", icon: "guest" },
];

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ user, size }: { user: ShellUser; size: number }) {
  return user.image ? (
    <Image
      src={user.image}
      alt={user.name ?? "Profile"}
      width={size}
      height={size}
      className="rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
      style={{ width: size, height: size }}
    >
      {initials(user.name)}
    </span>
  );
}

const iconButton =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";

function TopBarContent({
  user,
  unreadNotifications,
  isDev,
  pathname,
}: {
  user: ShellUser;
  unreadNotifications: number;
  isDev: boolean;
  pathname: string;
}) {
  const { count } = useBasket();
  const atRoot = isRootPath(pathname);
  // The basket is only relevant while shopping or when it has something in it.
  const showBasket = count > 0 || tabForPath(pathname) === "market";

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {atRoot ? (
          <ThemeAppIcon size={28} className="h-7 w-7 shrink-0 overflow-hidden rounded-md" priority />
        ) : (
          <Link href={backFor(pathname)} aria-label="Back" className={iconButton}>
            <ShellIcon name="back" className="h-5 w-5" />
          </Link>
        )}
        <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{titleFor(pathname)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {showBasket && (
          <Link href="/marketplace/basket" aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`} className={iconButton}>
            <ShellIcon name="basket" className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-black">
                {count}
              </span>
            )}
          </Link>
        )}
        <NotificationsPopover userId={user.id} initialUnreadCount={unreadNotifications} />
        <QRPopover userId={user.id} variant="icon" />
        {isDev ? (
          // The floating dev-tools cog sits in the top-right corner; keep clear of it.
          <span className="w-10 shrink-0" aria-hidden />
        ) : (
          <Link href="/profile" aria-label="Profile" className="ml-1 shrink-0">
            <Avatar user={user} size={32} />
          </Link>
        )}
      </div>
    </>
  );
}

function SectionChips({ pathname }: { pathname: string }) {
  const chips = chipsFor(pathname);
  if (!chips) return null;
  return (
    <nav aria-label="Section" className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-4 pb-1 pt-3 sm:px-6 lg:px-8">
      {chips.map((chip) => {
        const active = pathname === chip.href;
        return (
          <Link
            key={chip.href}
            href={chip.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              active
                ? "border-amber-500 bg-amber-500 text-black"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NewAppShell({
  user,
  unreadNotifications,
  winnerSelectionPending,
  isDev,
  impersonation,
  children,
}: NewAppShellProps) {
  const pathname = usePathname() ?? "/dashboard2";
  const activeTab = tabForPath(pathname);
  const isStaff = user.role === "admin" || user.role === "moderator";

  const sidebarLink = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    }`;

  return (
    <div className="new-shell flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:flex">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <ThemeAppIcon size={32} className="h-8 w-8 overflow-hidden rounded-lg" />
          <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">Penthouse Drift</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
          {NEW_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={sidebarLink(activeTab === tab.key)}
            >
              <TabIcon tab={tab.key} className="h-5 w-5" />
              {tab.label}
            </Link>
          ))}

          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Explore
          </p>
          {EXPLORE_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={sidebarLink(pathname.startsWith(link.href))}>
              <ShellIcon name={link.icon} className="h-5 w-5" />
              {link.label}
            </Link>
          ))}

          {user.role === "asbo-rc" && (
            <Link href="/asbo-rc" className={sidebarLink(pathname.startsWith("/asbo-rc"))}>
              <ShellIcon name="reports" className="h-5 w-5" />
              Reports
            </Link>
          )}
          {isStaff && (
            <Link
              href="/admin"
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              <span className="flex items-center gap-3">
                <ShellIcon name="admin" className="h-5 w-5" />
                {user.role === "moderator" ? "Mod panel" : "Admin panel"}
              </span>
              {winnerSelectionPending && (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" title="Weekly winner needs selecting" />
              )}
            </Link>
          )}
        </nav>

        <div className="space-y-1 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <Link href="/profile" className={sidebarLink(pathname.startsWith("/profile"))}>
            <Avatar user={user} size={24} />
            <span className="truncate">{user.name ?? "Profile"}</span>
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ShellIcon name="logout" className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ── Top bar: fixed on mobile (PWA safe-area aware), in-flow on desktop ── */}
        <header className="pwa-mobile-header fixed left-0 right-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
          <TopBarContent user={user} unreadNotifications={unreadNotifications} isDev={isDev} pathname={pathname} />
        </header>
        <header className="hidden items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
          <TopBarContent user={user} unreadNotifications={unreadNotifications} isDev={isDev} pathname={pathname} />
        </header>

        <main className="pwa-protected-content flex min-h-0 flex-1 flex-col overflow-y-auto md:pt-0">
          <PullToRefresh>
            <div className="pwa-protected-bottom flex flex-1 flex-col md:pb-0">
              {impersonation && (
                <div className="bg-amber-100 px-4 py-1 text-center text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                  Dev tools · viewing as a member
                  {impersonation === "member_active" ? " with an active membership" : ""}
                </div>
              )}
              <SectionChips pathname={pathname} />
              {children}
            </div>
          </PullToRefresh>
        </main>

        {/* ── Bottom tabs (mobile) ─────────────────────────────────────────── */}
        <nav
          aria-label="Main"
          className="pwa-bottom-nav fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden"
        >
          {NEW_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                  active ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {active && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-amber-500" />}
                <TabIcon tab={tab.key} className="h-6 w-6" />
                {tab.label}
                {tab.key === "menu" && isStaff && winnerSelectionPending && (
                  <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
