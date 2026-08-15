"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { QRPopover } from "@/components/QRPopover";

interface NavUser {
  id?: string;
  name?: string | null;
  image?: string | null;
  role?: "admin" | "moderator" | "member";
}

interface AdminNavigationProps {
  user: NavUser;
  unreadNotifications?: number;
}

const adminNavItems = [
  { href: "/admin", label: "Admin Home", icon: HomeIcon, exact: true },
  { href: "/admin/check-in", label: "QR Scan", icon: CheckInIcon },
  { href: "/admin/members", label: "Members", icon: MembersIcon },
  { href: "/admin/events", label: "Events", icon: EventsIcon },
  { href: "/admin/orders", label: "Shop Orders", icon: ActivityIcon, adminOnly: true },
  { href: "/admin/shop", label: "Shop Products", icon: FeedbackIcon, adminOnly: true },
  { href: "/admin/feedback", label: "Feedback", icon: FeedbackIcon },
  { href: "/admin/activity", label: "Activity Log", icon: ActivityIcon, adminOnly: true },
  { href: "/admin/notifications", label: "Global Alerts", icon: BellIcon, adminOnly: true },
  { href: "/admin/history", label: "History", icon: HistoryIcon },
  { href: "/admin/showcase-winners", label: "Winners", icon: TrophyIcon, adminOnly: true },
  { href: "/admin/facebook", label: "Facebook", icon: ShareIcon, adminOnly: true },
  { href: "/admin/development", label: "Dev Lab", icon: LabIcon, adminOnly: true },
];

export function AdminNavigation({ user, unreadNotifications = 0 }: AdminNavigationProps) {
  const pathname = usePathname();
  const isModerator = user.role === "moderator";
  const roleLabel = user.role === "moderator" ? "Moderator" : user.role === "admin" ? "Admin" : "Staff";
  const visibleItems = adminNavItems.filter((item) => !isModerator || !item.adminOnly);

  return (
    <>
      {/* Mobile & Tablet top header navigation */}
      <header className="pwa-mobile-header fixed top-0 left-0 right-0 z-40 flex md:hidden items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-amber-500 transition-colors bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700"
          >
            <span>←</span> Back to Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {user.id && <QRPopover userId={user.id} variant="button" buttonText="Show QR code" />}
          {user.id && <NotificationsPopover userId={user.id} initialUnreadCount={unreadNotifications} />}
          <Link href="/profile">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name ?? roleLabel}
                className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs">
                {user.name ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
            <img src="/icons/icon-192.png" alt="Penthouse Drift" className="h-8 w-8 shrink-0" />
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {isModerator ? "Mod Portal" : "Admin Portal"}
            </span>
          </Link>
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? roleLabel}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700 shrink-0"
              title={`${user.name ?? roleLabel} (${roleLabel})`}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs shrink-0"
              title={`${user.name ?? roleLabel} (${roleLabel})`}
            >
              {user.name ? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const isSundayWinnerItem = item.href === "/admin/showcase-winners" && new Date().getDay() === 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </div>
                {isSundayWinnerItem && (
                  <span className="rounded-md bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 uppercase tracking-wider animate-pulse">
                    Sunday
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href="/dashboard"
            prefetch={true}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 transition-colors"
          >
            <BackIcon className="w-5 h-5" />
            Back to Member Area
          </Link>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="pwa-admin-bottom-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md">
        {/* Scrollable nav items list */}
        <div className="flex-1 flex items-center overflow-x-auto no-scrollbar">
          {visibleItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex flex-shrink-0 flex-col items-center justify-center gap-1 py-2 px-3 text-[10px] font-medium transition-colors min-w-[64px] ${
                  isActive ? "text-amber-500 font-bold" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="truncate max-w-[68px] text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Fixed Right-Side Exit/Back Button */}
        <Link
          href="/dashboard"
          className="flex flex-shrink-0 flex-col items-center justify-center gap-1 py-2 px-3 text-[10px] font-bold text-amber-600 dark:text-amber-500 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 min-w-[64px] z-10 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_10px_rgba(0,0,0,0.4)]"
        >
          <BackIcon className="w-5 h-5" />
          <span className="truncate">Exit</span>
        </Link>
      </nav>
    </>
  );
}

function MembersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function CheckInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.996.178-1.768-.767-1.5-1.732a11.966 11.966 0 0 1 3.462-5.26A.75.75 0 0 1 8.25 2.25v.894m-3 1.092V7.5A7.5 7.5 0 0 0 9.497 14.25m-4.247-10.014A23.849 23.849 0 0 1 12 3.75a23.849 23.849 0 0 1 6.75.486m0 0V7.5a7.5 7.5 0 0 1-4.003 6.75m4.003-10.014a1.125 1.125 0 0 1 1.5 1.732 11.966 11.966 0 0 1-3.462 5.26.75.75 0 0 1-1.037.025V2.25" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function LabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5.059 14.45A3.75 3.75 0 0 0 7.71 20.25h8.58a3.75 3.75 0 0 0 2.651-5.801l-4.032-4.041a2.25 2.25 0 0 1-.659-1.591V3.104M9.75 3.104c.2-.02.404-.031.611-.031h3.278c.207 0 .41.01.611.031M9.75 3.104h4.5M10.5 11.25h3" />
    </svg>
  );
}

function FeedbackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}
