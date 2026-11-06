/**
 * Shown while the DriftClash page loads (it gathers your cards, wallet, packs and challenges first). It has the shape of
 * the game, a bar for your level and wallet, the play tiles, and a row of cards, so the screen does not jump when it arrives.
 */
export default function CardsLoading() {
  return (
    <div className="min-h-full bg-zinc-100 px-2.5 py-2.5 dark:bg-zinc-950 sm:px-6 sm:py-5 lg:px-8">
      <div role="status" aria-label="Loading DriftClash" className="mx-auto max-w-6xl space-y-3">
        <div className="gx-shimmer h-[4.5rem] rounded-2xl" />
        <div className="gx-shimmer h-40 rounded-2xl" />
        <div className="gx-shimmer h-5 w-1/3 rounded-lg" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="gx-shimmer aspect-[63/88] w-28 shrink-0 rounded-2xl" />
          ))}
        </div>
        <span className="sr-only">Loading DriftClash…</span>
      </div>
    </div>
  );
}
