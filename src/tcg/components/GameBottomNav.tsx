"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface GameNavItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  /** Small count or reward shown on the icon. */
  badge: string | null;
  /** Highlights the badge (the daily Clash win that can still be claimed). */
  urgent: boolean;
}

const noSubscription = () => () => {};

/**
 * DriftClash's own navigation on phones: one row of sections fixed to the bottom of the screen,
 * sitting directly above the app's main tab bar. It is drawn on the page body, not inside the page,
 * because the page content is wrapped in pull-to-refresh, whose transform would stop a fixed bar
 * from sticking to the screen. On larger screens the sections stay in the DriftClash header.
 */
export function GameBottomNav({
  items,
  active,
  onSelect,
}: {
  items: GameNavItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const bar = useRef<HTMLElement>(null);
  // How tall the main tab bar is (it includes the phone's safe area), so this bar sits exactly on top of it.
  const [offset, setOffset] = useState(56);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".pwa-bottom-nav");
    if (!bar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setOffset(Math.round(bar.getBoundingClientRect().height)));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [mounted]);

  // With many sections the bar scrolls sideways; keep the current one in view.
  useEffect(() => {
    const current = bar.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active, mounted]);

  if (!mounted) return null;

  return createPortal(
    <nav
      ref={bar}
      aria-label="DriftClash sections"
      style={{ bottom: offset }}
      className="fixed inset-x-0 z-30 flex overflow-x-auto overscroll-x-contain border-t border-amber-500/30 bg-zinc-950/95 px-1 shadow-[0_-8px_20px_rgba(0,0,0,0.35)] backdrop-blur-sm [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.badge ? `${item.label}, ${item.badge}` : item.label}
            className={`relative flex min-h-[3.25rem] min-w-[4.25rem] flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-black transition-colors ${
              isActive ? "text-amber-400" : "text-zinc-400"
            }`}
          >
            {isActive && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-amber-500" />}
            <span aria-hidden className="relative text-lg leading-none">
              {item.icon}
              {item.badge && (
                <span
                  className={`absolute -right-3.5 -top-1.5 rounded-full px-1 text-[9px] font-extrabold leading-4 ${
                    item.urgent ? "bg-emerald-500 text-black" : "bg-zinc-700 text-zinc-100"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </span>
            <span aria-hidden>{item.shortLabel}</span>
          </button>
        );
      })}
    </nav>,
    document.body
  );
}
