"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isAtTop = useRef(true);
  const router = useRouter();

  const MAX_PULL = 120; // max px to pull down
  const THRESHOLD = 80; // px required to trigger refresh

  useEffect(() => {
    const getScrollContainer = () => {
      if (!containerRef.current) return window;
      // Find the closest parent with overflow-y-auto or overflow-y-scroll
      let el: HTMLElement | null = containerRef.current;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return el;
        }
        el = el.parentElement;
      }
      return window;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const scrollContainer = getScrollContainer();
      const scrollTop = scrollContainer === window 
        ? window.scrollY 
        : (scrollContainer as HTMLElement).scrollTop;
        
      isAtTop.current = scrollTop <= 0;
      if (isAtTop.current) {
        startY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTop.current || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const pullDistance = currentY.current - startY.current;

      if (pullDistance > 0) {
        // Prevent default scroll behavior when pulling down from top
        if (e.cancelable) e.preventDefault();
        
        setIsPulling(true);
        // Add resistance factor
        const progress = Math.min(pullDistance * 0.5, MAX_PULL);
        setPullProgress(progress);
      }
    };

    const handleTouchEnd = () => {
      if (isRefreshing || !isPulling) return;

      if (pullProgress > THRESHOLD) {
        setIsRefreshing(true);
        // Trigger Next.js router refresh
        router.refresh();
        
        // Reset after a delay to show the "refreshing" state briefly
        setTimeout(() => {
          setIsRefreshing(false);
          setIsPulling(false);
          setPullProgress(0);
        }, 1000);
      } else {
        // Snap back if threshold not met
        setIsPulling(false);
        setPullProgress(0);
      }
    };

    // Passive: false is required to call preventDefault
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isPulling, isRefreshing, pullProgress, router]);

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
