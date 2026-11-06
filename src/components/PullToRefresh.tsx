"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Touches that start inside any of these never start a pull: sheets, dialogs and anything marked as its own scroller. */
const IGNORE_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog, [data-no-ptr]';

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshPending, startRefresh] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const MAX_PULL = 120; // max px to pull down
  const THRESHOLD = 80; // px required to trigger refresh

  // The gesture lives in refs so the listeners are added once, not every time the finger moves.
  const gesture = useRef({
    startX: 0,
    startY: 0,
    /** null until the finger has moved far enough to tell what the gesture is. */
    mode: null as null | "pull" | "ignore",
    tracking: false,
    progress: 0,
    refreshing: false,
    startedAt: 0,
  });

  const finish = () => {
    gesture.current.refreshing = false;
    gesture.current.progress = 0;
    setIsRefreshing(false);
    setIsPulling(false);
    setPullProgress(0);
  };

  useEffect(() => {
    const getScrollContainer = () => {
      if (!containerRef.current) return window;
      // Find the closest parent with overflow-y-auto or overflow-y-scroll
      let el: HTMLElement | null = containerRef.current;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") return el;
        el = el.parentElement;
      }
      return window;
    };

    const onStart = (e: TouchEvent) => {
      const g = gesture.current;
      g.tracking = false;
      g.mode = null;
      if (g.refreshing) return;
      const target = e.target instanceof Element ? e.target : null;
      // Only touches on the page content itself, never on a sheet or other overlay drawn over it.
      if (!target || !containerRef.current?.contains(target) || target.closest(IGNORE_SELECTOR)) return;
      const scroller = getScrollContainer();
      const scrollTop = scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop;
      if (scrollTop > 0) return;
      g.tracking = true;
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g.tracking || g.refreshing || g.mode === "ignore") return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (g.mode === null) {
        // Wait until the finger has clearly gone one way. Sideways (a row of cards, the section bar) or up is not a pull.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.mode = Math.abs(dx) > Math.abs(dy) || dy < 0 ? "ignore" : "pull";
        if (g.mode === "ignore") return;
      }
      if (dy <= 0) return;
      if (e.cancelable) e.preventDefault();
      g.progress = Math.min(dy * 0.5, MAX_PULL);
      setIsPulling(true);
      setPullProgress(g.progress);
    };

    const onEnd = () => {
      const g = gesture.current;
      const wasPull = g.tracking && g.mode === "pull";
      g.tracking = false;
      if (!wasPull || g.refreshing) return;
      if (g.progress > THRESHOLD) {
        g.refreshing = true;
        g.startedAt = Date.now();
        setIsRefreshing(true);
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12);
        // The refresh runs as a transition, so `refreshPending` stays true until the new page data has arrived.
        startRefresh(() => router.refresh());
      } else {
        g.progress = 0;
        setIsPulling(false);
        setPullProgress(0);
      }
    };

    // Passive: false is required to call preventDefault while a pull is under way.
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  // Done when the new data has arrived, but "Refreshing" shows for long enough to be seen. A safety stop covers a refresh that never reports back.
  useEffect(() => {
    if (!isRefreshing) return;
    const stop = setTimeout(finish, 10000);
    if (refreshPending) return () => clearTimeout(stop);
    const wait = Math.max(0, 700 - (Date.now() - gesture.current.startedAt));
    const done = setTimeout(finish, wait);
    return () => {
      clearTimeout(stop);
      clearTimeout(done);
    };
  }, [isRefreshing, refreshPending]);

  return (
    <div ref={containerRef} className="relative min-h-full w-full bg-inherit flex flex-col flex-1">
      {/* Pull indicator */}
      <div 
        className={`absolute top-0 left-0 right-0 flex justify-center items-end overflow-hidden transition-all duration-200 ${!isPulling && !isRefreshing ? 'duration-300' : 'duration-0'}`}
        style={{ 
          height: isRefreshing ? '60px' : `${pullProgress}px`,
          opacity: pullProgress / MAX_PULL 
        }}
      >
        <div className="pb-4 flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
          {isRefreshing ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Refreshing</span>
            </>
          ) : (
            <>
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${pullProgress > THRESHOLD ? 'rotate-180 text-amber-500' : ''}`} 
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider">
                {pullProgress > THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - shifts down when pulling */}
      <div 
        className={`relative transition-transform ${!isPulling && !isRefreshing ? 'duration-300' : 'duration-0'}`}
        style={{ transform: `translateY(${isRefreshing ? 60 : pullProgress}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
