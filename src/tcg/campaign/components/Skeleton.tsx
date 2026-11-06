/** A placeholder shaped like the campaign screen while it loads, so the page does not jump when it arrives. */
export function CampaignSkeleton() {
  return (
    <div role="status" aria-label="Loading the campaign" className="space-y-3 animate-pulse">
      <div className="h-24 rounded-2xl bg-zinc-800/80" />
      <div className="h-14 rounded-2xl bg-zinc-800/60" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-12 rounded-xl bg-zinc-800/50" />
        ))}
      </div>
      <span className="sr-only">Loading the campaign…</span>
    </div>
  );
}
