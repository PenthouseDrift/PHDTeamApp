"use client";

import { useId, useState } from "react";
import type { TrackCardDefinition } from "@/lib/crew-cards";
import type { CarInsight } from "@/tcg/lineup-insight";

/**
 * Under the car in front on the lineup screen: what the track's buff and hazard do to this car. Closed, it shows just the
 * outcome as chips. Opened, it also shows each rule in full and whether it reaches this car. This is the only place the
 * track's rules are shown on that screen. The corner types stay hidden until each corner is raced, and debuffs are only
 * dealt at the corner itself.
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buffs = insight.notes.filter((n) => n.tone === "buff").map((n) => n.text);
  const hazards = insight.notes.filter((n) => n.tone === "hazard").map((n) => n.text);

  const rows = [
    { key: "buff", icon: "✨", rule: track.buffLabel, applied: buffs, tone: "buff" as const },
    { key: "hazard", icon: "⚠️", rule: track.debuffLabel, applied: hazards, tone: "hazard" as const },
  ].filter((r) => Boolean(r.rule));

  return (
    <section aria-label={`${track.name} effects on ${carName}`} className="rounded-xl border border-zinc-800 bg-black/30 text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="gx-tap flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left"
      >
        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-wide text-zinc-400">
          <span aria-hidden>{track.icon}</span> {track.name}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-zinc-500">
          {open ? "Hide rules" : "Rules"}
          <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
      </button>

      {/* What it does to this car, always visible */}
      <div className="px-2.5 pb-2.5">
        {insight.notes.length === 0 ? (
          <p className="text-xs font-semibold text-zinc-500">No track buff or hazard for this car</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {insight.notes.map((note) => (
              <li
                key={`${note.tone}-${note.text}`}
                className={`rounded-lg border px-2 py-1 text-xs font-black leading-snug ${
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

      {open && (
        <div id={panelId} className="space-y-2 border-t border-zinc-800 p-2.5">
          {rows.length === 0 && <p className="text-xs font-semibold text-zinc-400">This track has no buff or hazard</p>}
          {rows.map((r) => {
            const hits = r.applied.length > 0;
            const good = r.tone === "buff";
            return (
              <div
                key={r.key}
                className={`rounded-xl border p-2.5 ${
                  hits ? (good ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10") : "border-zinc-800 bg-black/30"
                }`}
              >
                <p className={`text-xs font-bold leading-snug ${hits ? (good ? "text-emerald-200" : "text-rose-200") : "text-zinc-500"}`}>
                  <span aria-hidden>{r.icon} </span>
                  {r.rule}
                </p>
                <p className={`mt-1.5 text-xs font-black ${hits ? (good ? "text-emerald-300" : "text-rose-300") : "text-zinc-500"}`}>
                  {hits ? "Applies to this car" : good ? "Doesn't apply to this car" : "This car avoids it"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
