import type { CampaignRoundView } from "../types";

/**
 * The card at the top of a cup in progress: who you play next and what winning is worth. It is the one thing to look at
 * before pressing Play.
 */
export function NextUpCard({
  round,
  prize,
  blocked,
}: {
  round: CampaignRoundView;
  /** Text for what winning pays, for example "🪙 100". Null when there is no prize (a test cup). */
  prize: string | null;
  /** Why the player cannot start yet, for example a car that needs repair. */
  blocked: string | null;
}) {
  const final = round.short === "Final";
  return (
    <section
      aria-label={`Next up: ${round.name}`}
      className={`relative overflow-hidden rounded-2xl border p-3 text-white ${
        final ? "border-amber-300/70 bg-gradient-to-br from-[#27408f] to-[#14275a]" : "border-blue-300/20 bg-gradient-to-br from-[#1f3a85] to-[#132a5e]"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
        Next up · {round.name}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30 text-3xl">
          {round.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={round.portraitUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{round.icon}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black leading-tight">{round.driverName}</p>
          <p className="truncate text-xs text-blue-100/80">{round.teamName}</p>
        </div>
        {prize && (
          <div className="shrink-0 rounded-xl bg-black/30 px-2.5 py-1.5 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-blue-200/80">Win</p>
            <p className="text-base font-black tabular-nums text-emerald-300">{prize}</p>
          </div>
        )}
      </div>
      {blocked && (
        <p role="status" className="mt-2 rounded-lg bg-yellow-400 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-black">
          ⚠ {blocked}
        </p>
      )}
    </section>
  );
}
