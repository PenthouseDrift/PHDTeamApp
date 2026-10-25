"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { QRPopover } from "@/components/QRPopover";
import { ThemeAppIcon } from "@/components/ThemeAppIcon";
import { ShellIcon, type ShellIconName } from "@/components/new-shell/shell-icons";
import {
  adminBackFor,
  adminTabForPath,
  adminTabsFor,
  adminTitleFor,
  isAdminRoot,
  type AdminTabKey,
} from "@/lib/admin-nav";

/**
 * Shell for the admin/mod portal when the staff member has "New dashboard" on.
 * Mirrors the member shell (same safe-area classes, top bar, bottom tabs and
 * sidebar) so staff and member views feel like one app, but with the staff
 * information architecture from `admin-nav.ts`.
 */

interface ShellUser {
  id: string;
  name?: string | null;
  image?: string | null;
  role?: "admin" | "moderator" | "member" | "asbo-rc";
}

const TAB_ICONS: Record<AdminTabKey, ShellIconName> = {
  today: "home",
  checkin: "checkin",
  members: "members",
  reports: "reports",
  more: "more",
};

const iconButton =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";

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

function TopBarContent({
  user,
  unreadNotifications,
  pathname,
  roleLabel,
}: {
  user: ShellUser;
  unreadNotifications: number;
  pathname: string;
  roleLabel: string;
}) {
  const atRoot = isAdminRoot(pathname);
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {atRoot ? (
          <ThemeAppIcon size={28} className="h-7 w-7 shrink-0 overflow-hidden rounded-md" priority />
        ) : (
          <Link href={adminBackFor(pathname)} aria-label="Back" className={iconButton}>
            <ShellIcon name="back" className="h-5 w-5" />
          </Link>
        )}
        <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{adminTitleFor(pathname)}</span>
        <span className="shrink-0 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
          {roleLabel}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <NotificationsPopover userId={user.id} initialUnreadCount={unreadNotifications} />
        <QRPopover userId={user.id} variant="icon" />
        <Link href="/profile" aria-label="Profile" className="ml-1 shrink-0">
          <Avatar user={user} size={32} />
        </Link>
      </div>
    </>
  );
}

export function NewAdminShell({
  user,
  unreadNotifications,
  children,
}: {
  user: ShellUser;
  unreadNotifications: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const activeTab = adminTabForPath(pathname);
  const tabs = adminTabsFor(user.role);
  const roleLabel = user.role === "moderator" ? "Mod" : "Admin";

  const sidebarLink = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    }`;

  return (
    <div className="new-shell flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── Desktop / tablet sidebar ─────────────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:flex">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <ThemeAppIcon size={32} className="h-8 w-8 overflow-hidden rounded-lg" />
          <div className="min-w-0">
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Penthouse Drift</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              {user.role === "moderator" ? "Moderator portal" : "Admin portal"}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Staff">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={sidebarLink(activeTab === tab.key)}
            >
              <ShellIcon name={TAB_ICONS[tab.key]} className="h-5 w-5" />
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-1 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <Link
            href="/dashboard2"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            <ShellIcon name="back" className="h-5 w-5" />
            Member app
          </Link>
          <Link href="/profile" className={sidebarLink(false)}>
            <Avatar user={user} size={24} />
            <span className="truncate">{user.name ?? "Profile"}</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar: fixed on mobile (PWA safe-area aware), in-flow on desktop */}
        <header className="pwa-mobile-header fixed left-0 right-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
          <TopBarContent user={user} unreadNotifications={unreadNotifications} pathname={pathname} roleLabel={roleLabel} />
        </header>
        <header className="hidden items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
          <TopBarContent user={user} unreadNotifications={unreadNotifications} pathname={pathname} roleLabel={roleLabel} />
        </header>

        <main className="pwa-protected-content flex min-h-0 flex-1 flex-col overflow-y-auto md:pt-0">
          <div className="pwa-protected-bottom flex flex-1 flex-col md:pb-0">{children}</div>
        </main>

        {/* Bottom tabs (mobile) */}
        <nav
          aria-label="Staff"
          className="pwa-bottom-nav fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden"
        >
          {tabs.map((tab) => {
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
                <ShellIcon name={TAB_ICONS[tab.key]} className="h-6 w-6" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
