"use client";

import { useState } from "react";
import { FINALE_STATS, FINALE_STAT_LABEL, type FinaleStat } from "../finale";
import type { CornerScoreParts, CornerStatStages, EvaluatedCornerResult } from "../progression";

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

interface Names {
  crew: string;
  track: string;
  debuff: string;
  trackIcon: string;
}

interface Delta {
  key: string;
  icon: string;
  title: string;
  value: number;
}

/** What each step did to one stat: Crew, then the track, then the debuff. Steps that changed nothing are left out. */
function statDeltas(stages: CornerStatStages, stat: FinaleStat, names: Names): Delta[] {
  const out: Delta[] = [
    { key: "crew", icon: "⚡", title: names.crew, value: stages.afterCrew[stat] - stages.base[stat] },
    { key: "track", icon: names.trackIcon, title: names.track, value: stages.afterTrack[stat] - stages.afterCrew[stat] },
    { key: "debuff", icon: "⚠️", title: names.debuff, value: stages.final[stat] - stages.afterTrack[stat] },
  ];
  return out.filter((d) => d.value !== 0);
}

interface ScoreLine {
  key: string;
  icon: string;
  title: string;
  value: number;
}

/** The points that make up a corner score, besides the stat formula itself. Lines worth 0 are left out. */
function scoreLines(parts: CornerScoreParts, names: Names): ScoreLine[] {
  const lines: ScoreLine[] = [
    { key: "tier", icon: "🏅", title: "Tier bonus", value: parts.tierBonus },
    { key: "crew", icon: "⚡", title: `Crew · ${names.crew}`, value: parts.crewPts },
    { key: "track", icon: names.trackIcon, title: `Track · ${names.track}`, value: parts.trackPts },
    { key: "debuff", icon: "⚠️", title: `Debuff · ${names.debuff}`, value: parts.debuffPts },
    { key: "floor", icon: "🛟", title: "Minimum score", value: parts.floorAdjust },
    { key: "finale", icon: "🎯", title: "Finale", value: parts.finalePts },
  ];
  return lines.filter((l) => l.value !== 0);
}

interface ClashRevealPanelProps {
  result: EvaluatedCornerResult;
  cornerNumber: number;
  /** How much of the rival has been revealed: 1 to 4 stats (drift, accel, grip, steer), then 5 for the totals. */
  level: number;
  /**
   * True once the winner is being announced. The panel then drops down out of the way of that animation, and a
   * banner sits over the arena, so the panel can be brought in front of it.
   */
  winnerStage: boolean;
}

/**
 * The reveal, docked at the bottom of the arena: both cars' stats side by side with every buff and debuff that changed
 * each one (Crew, track, debuff). The rival's stats appear one by one. Then the totals appear with every point that
 * made them up.
 *
 * When the winner is announced the panel drops down to just its title bar so the last animation can be seen. Click
 * the bar to open it again: it opens in front of the winner banner. Click the bar again to drop it back down.
 */
export function ClashRevealPanel({ result, cornerNumber, level, winnerStage }: ClashRevealPanelProps) {
  // "auto" follows the reveal (open, then dropped down for the winner). Clicking the bar takes over from there.
  const [userState, setUserState] = useState<"auto" | "open" | "collapsed">("auto");
  const [inFront, setInFront] = useState(false);

  const { playerStatStages: pStages, rivalStatStages: rStages, playerScoreParts: pParts, rivalScoreParts: rParts } = result;
  if (!pStages || !rStages || !pParts || !rParts) return null;

  const collapsed = userState === "collapsed" || (userState === "auto" && winnerStage);

  const handleBarClick = () => {
    if (collapsed) {
      // Opens straight in front of the winner banner.
      setUserState("open");
      setInFront(true);
    } else {
      // Drop it back down.
      setUserState("collapsed");
      setInFront(false);
    }
  };

  const trackIcon = result.trackCard.icon;
  const pNames: Names = { crew: result.playerCrewCard.name, track: result.trackCard.name, debuff: result.playerDebuffCard.name, trackIcon };
  const rNames: Names = { crew: result.rivalCrewCard.name, track: result.trackCard.name, debuff: result.rivalDebuffCard.name, trackIcon };
  const totalsShown = level >= 5;
  const bodyId = `reveal-body-${cornerNumber}`;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 animate-in slide-in-from-bottom-4 duration-300 ${
        inFront ? "z-[60]" : "z-40"
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-cyan-400/70 bg-zinc-950/95 shadow-[0_0_35px_rgba(6,182,212,0.5)] backdrop-blur-md"
        // If the winner banner appears over a panel that is already open, a tap on the panel brings it in front.
        onPointerDownCapture={() => {
          if (!collapsed && winnerStage && !inFront) setInFront(true);
        }}
      >
        <button
          type="button"
          onClick={handleBarClick}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
            🔍 Corner {cornerNumber} · Every buff &amp; debuff
          </span>
          <span className="flex items-center gap-2">
            {totalsShown && (
              <span className="text-[11px] font-black">
                <span className="text-amber-300">{result.playerScore}</span>
                <span className="mx-1 text-zinc-500">–</span>
                <span className="text-rose-300">{result.rivalScore}</span>
              </span>
            )}
            <span
              className={`text-[10px] text-cyan-300 transition-transform duration-500 ${collapsed ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▼
            </span>
            <span className="sr-only">
              {collapsed ? "Open the breakdown" : "Drop the breakdown down"}
            </span>
          </span>
        </button>

        {/* The body drops down (collapses) smoothly. */}
        <div
          id={bodyId}
          className={`grid transition-[grid-template-rows] duration-500 ease-in-out motion-reduce:transition-none ${
            collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto px-2.5 pb-2.5" inert={collapsed}>
              <p className="flex flex-wrap items-center justify-center gap-x-3 text-[9px] font-bold text-zinc-500">
                <span>
                  <span aria-hidden>⚡</span> Crew
                </span>
                <span>
                  <span aria-hidden>{trackIcon}</span> Track
                </span>
                <span>
                  <span aria-hidden>⚠️</span> Debuff
                </span>
              </p>

              <ul className="mt-1.5 space-y-1">
                {FINALE_STATS.map((stat, i) => {
                  const rivalShown = level >= i + 1;
                  const mine = pStages.final[stat];
                  const theirs = rStages.final[stat];
                  return (
                    <li key={stat} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-1.5 rounded-xl bg-zinc-900/70 px-1.5 py-1">
                      <StatCell stages={pStages} stat={stat} names={pNames} tone="you" win={rivalShown && mine > theirs} />
                      <span className="w-10 text-center text-[8px] font-black uppercase tracking-wider text-zinc-500">{FINALE_STAT_LABEL[stat]}</span>
                      {rivalShown ? (
                        <StatCell stages={rStages} stat={stat} names={rNames} tone="rival" win={theirs > mine} animate />
                      ) : (
                        <span className="text-center text-lg font-black text-zinc-600" aria-label="hidden">
                          ?
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {totalsShown && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-zinc-800 pt-2 animate-in fade-in zoom-in-95 duration-300">
                  <ScoreColumn tone="you" parts={pParts} lines={scoreLines(pParts, pNames)} total={result.playerScore} />
                  <ScoreColumn tone="rival" parts={rParts} lines={scoreLines(rParts, rNames)} total={result.rivalScore} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  stages,
  stat,
  names,
  tone,
  win,
  animate = false,
}: {
  stages: CornerStatStages;
  stat: FinaleStat;
  names: Names;
  tone: "you" | "rival";
  win: boolean;
  animate?: boolean;
}) {
  const deltas = statDeltas(stages, stat, names);
  const colour = tone === "you" ? "text-amber-300" : "text-rose-300";
  return (
    <span className={`flex flex-col items-center ${animate ? "animate-in zoom-in-90 fade-in duration-300" : ""}`}>
      <span className="flex items-baseline gap-1">
        <span className="text-[9px] font-bold text-zinc-500" aria-label={`base ${stages.base[stat]}`}>
          {stages.base[stat]}
        </span>
        <span className="text-[9px] text-zinc-600" aria-hidden>
          →
        </span>
        <span className={`text-lg font-black leading-none ${win ? colour : "text-zinc-200"}`} aria-label={`final ${stages.final[stat]}`}>
          {stages.final[stat]}
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-center gap-0.5">
        {deltas.length === 0 ? (
          <span className="text-[8px] font-bold text-zinc-600">no changes</span>
        ) : (
          deltas.map((d) => (
            <span
              key={d.key}
              title={d.title}
              aria-label={`${d.title}: ${signed(d.value)}`}
              className={`rounded-full px-1 py-px text-[8px] font-black ${
                d.value > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
              }`}
            >
              <span aria-hidden>{d.icon}</span>
              {signed(d.value)}
            </span>
          ))
        )}
      </span>
    </span>
  );
}

function ScoreColumn({
  tone,
  parts,
  lines,
  total,
}: {
  tone: "you" | "rival";
  parts: CornerScoreParts;
  lines: ScoreLine[];
  total: number;
}) {
  const colour = tone === "you" ? "text-amber-300" : "text-rose-300";
  return (
    <div className="rounded-xl bg-zinc-900/70 p-1.5 text-center">
      <p className={`text-base font-black leading-none ${colour}`}>{total} PTS</p>
      <p className="mt-0.5 text-[8px] font-bold text-zinc-400">
        Stats <span className="font-black text-zinc-200">{parts.statScore}</span>
      </p>
      <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
        {lines.map((l) => (
          <span
            key={l.key}
            title={l.title}
            aria-label={`${l.title}: ${signed(l.value)}`}
            className={`rounded-full px-1 py-px text-[8px] font-black ${
              l.value > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
            }`}
          >
            <span aria-hidden>{l.icon}</span>
            {signed(l.value)}
          </span>
        ))}
      </span>
    </div>
  );
}
