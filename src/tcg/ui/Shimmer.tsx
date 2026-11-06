/**
 * Loading placeholders for DriftClash screens. They are shaped like what will arrive, so the page does not jump, and they
 * shimmer so it is clear something is on the way. Decorative: the label that screen readers get is on the wrapper.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`gx-shimmer rounded-xl ${className}`} />;
}

/** A card-shaped placeholder (the cards are 63 by 88). */
export function CardSkeleton({ className = "" }: { className?: string }) {
  return <Shimmer className={`aspect-[63/88] w-full rounded-2xl ${className}`} />;
}

export function CardGridSkeleton({ count = 6, className = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", label = "Loading cards" }: { count?: number; className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <CardSkeleton />
          <Shimmer className="h-9" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function RowsSkeleton({ rows = 5, rowClassName = "h-16", label = "Loading" }: { rows?: number; rowClassName?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Shimmer key={i} className={rowClassName} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** The whole-screen placeholder for a game tab that is still loading. */
export function TabSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <Shimmer className="h-20 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Shimmer className="h-16 rounded-2xl" />
        <Shimmer className="h-16 rounded-2xl" />
      </div>
      <Shimmer className="h-6 w-1/3" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton className="hidden sm:block" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span aria-hidden className={`gx-spinner inline-block rounded-full border-2 border-amber-400/30 border-t-amber-400 ${className}`} />;
}

/** A line with a spinner, for a short wait inside a panel or button row. */
export function LoadingNote({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-2.5 text-sm font-bold text-zinc-300">
      <Spinner />
      {text}
    </p>
  );
}

/**
 * A full-screen "working on it" cover for the waits that matter (buying and opening a pack, entering a challenge, saving a
 * result). It blocks taps so nothing can be pressed twice while the server is busy.
 */
export function BusyOverlay({ label, hint }: { label: string; hint?: string }) {
  return (
    <div role="status" aria-live="polite" className="gx-backdrop fixed inset-0 z-[10002] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="gx-fade-up w-full max-w-xs rounded-3xl border border-amber-500/40 bg-zinc-950 p-6 text-center text-white shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <Spinner className="h-8 w-8" />
        </div>
        <p className="text-base font-black">{label}</p>
        {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-800">
          <div className="gx-bar h-full w-2/5 rounded-full bg-amber-400" />
        </div>
      </div>
    </div>
  );
}
