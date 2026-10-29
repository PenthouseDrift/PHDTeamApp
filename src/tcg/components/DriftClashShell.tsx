"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/ThemeProvider";

interface DriftClashUser {
  id: string;
  name?: string | null;
  image?: string | null;
  role?: string;
}

export function DriftClashShell({
  user,
  children,
}: {
  user: DriftClashUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user.role === "admin";

  const navLinks = [
    { href: "/cards?tab=clash", label: "Play Clash", icon: "⚔️", exact: false },
    { href: "/cards", label: "Deck Hub", icon: "🃏", exact: true },
    { href: "/cards/new", label: "Forge Pack", icon: "✨", exact: false },
    { href: "/cars", label: "My Garage", icon: "🏎️", exact: false },
    ...(isAdmin
      ? [
          { href: "/admin/card-maker", label: "Card Studio", icon: "🛠️", exact: false },
          { href: "/admin/member-cards", label: "All Cards", icon: "🗂️", exact: false },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Compact Single-Row Top Game Bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/90">
        <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          {/* Brand Logo */}
          <Link href="/cards" className="flex items-center gap-2 shrink-0">
            <img
              src="/icons/icon-192.png"
              alt="DriftClash"
              className="h-8 w-8 rounded-xl border border-amber-500/40 object-cover shadow-sm"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-base">
                DriftClash
              </span>
              <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">
                TCG
              </span>
            </div>
          </Link>

          {/* Tablet & Desktop Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition-colors ${
                    active
                      ? "bg-amber-500 text-black shadow-sm"
                      : item.href.includes("clash")
                        ? "border border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 dark:text-amber-300"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Quick Actions + Compact Drawer Menu */}
          <div className="relative flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/cards?tab=clash"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-md shadow-amber-500/25 transition-all hover:scale-[1.03] active:scale-[0.98]"
            >
              <span className="text-sm">🎮</span>
              <span className="hidden sm:inline">Play Clash</span>
              <span className="sm:hidden">Play</span>
            </Link>

            <Link
              href="/cards/new"
              className="inline-flex md:hidden items-center gap-1 rounded-xl bg-zinc-800 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-zinc-700"
            >
              <span>✨</span>
              <span>Forge</span>
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-xs hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Open player menu"
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-1 pr-2 text-xs font-bold hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800"
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="h-6 w-6 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-[10px] font-black text-black">
                  {(user.name || "D").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[90px] truncate text-xs font-bold sm:inline">
                {user.name || "Driver"}
              </span>
              <span className="text-[10px] text-zinc-400">▾</span>
            </button>

            {/* Dropdown Menu for Garage, Admin Tools & Sign Out */}
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">
                      {user.name || "Driver"}
                    </p>
                    <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      Penthouse Drift Shared Account
                    </p>
                  </div>

                  <div className="py-1 space-y-0.5">
                    {navLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold ${
                          item.href.includes("clash")
                            ? "bg-amber-500/15 text-amber-500 dark:text-amber-300 font-black border border-amber-500/30"
                            : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>

                  <div className="border-t border-zinc-100 pt-1 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      <span>🚪</span>
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
