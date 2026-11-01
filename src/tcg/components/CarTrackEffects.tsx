import type { TrackCardDefinition } from "@/lib/crew-cards";
import type { CarInsight } from "@/tcg/lineup-insight";

/**
 * Under each car on the lineup screen: what this track's buffs and hazards do to this car. Only the track is shown.
 * The corner types stay hidden until each corner is raced, and debuffs are only dealt at the corner itself.
 */
export function CarTrackEffects({
  carName,
  insight,
  track,
}: {
  carName: string;
  insight: CarInsight;
  track: TrackCardDefinition;
}) {
  return (
    <section
      aria-label={`${track.name} effects on ${carName}`}
      className="space-y-1.5 rounded-xl border border-zinc-800 bg-black/40 p-1.5 text-left"
    >
      <div className="space-y-1">
        <p className="truncate text-[9px] font-black uppercase tracking-wide text-zinc-500">
          <span aria-hidden>{track.icon}</span> {track.name}
        </p>
        {insight.notes.length === 0 ? (
          <p className="text-[10px] font-semibold leading-tight text-zinc-400">No track buff or hazard for this car</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {insight.notes.map((note) => (
              <li
                key={`${note.tone}-${note.text}`}
                className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black leading-tight ${
                  note.tone === "buff"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                }`}
              >
                <span aria-hidden>{note.tone === "buff" ? "▲ " : "▼ "}</span>
                <span className="sr-only">{note.tone === "buff" ? "Buff: " : "Hazard: "}</span>
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
