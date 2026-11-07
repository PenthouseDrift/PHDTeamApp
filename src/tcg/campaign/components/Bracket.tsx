"use client";

import { useEffect, useRef } from "react";
import { CAMPAIGN_ROUNDS, PRIZE_MULTIPLIERS, prizeFor } from "../config";
import type { CampaignRoundView, CampaignStatus } from "../types";

/**
 * The cup drawn as a tournament board: name pills with a coloured tab, white connector lines, a trophy and a gold
 * CHAMPION badge at the end. Your road runs from the top left down to the trophy. Each round is a small match (you
 * against that round's driver) and the winner's line leads into the next round.
 *
 * Tab colours: green = through, red = knocked out, amber = playing now, blue = still to come, grey = beaten.
 * The drawing is for the eye only; a plain list of the same rounds is there for screen readers.
 */

// All sizes in rem so the drawing scales with the text size.
const PITCH = 8.5; // distance between one round and the next, across
const PILL_W = 7;
const PILL_H = 2;
const MATCH_GAP = 2.5; // between the two pills of a match
const MATCH_H = PILL_H * 2 + MATCH_GAP;
const STEP_Y = (MATCH_H - PILL_H) / 2; // so the winner's line meets the next round's top pill
const TOP = 1.25; // room for the round label above the first match
const CONNECTOR_W = 1;

type Tone = "through" | "out" | "live" | "idle" | "beaten";

const TAB: Record<Tone, string> = {
  through: "#16a34a",
  out: "#e11d48",
  live: "#f59e0b",
  idle: "#3b63c4",
  beaten: "#52525b",
};

function Pill({
  label,
  tone,
  dim = false,
  gold = false,
  fluid = false,
}: {
  label: string;
  tone: Tone;
  dim?: boolean;
  gold?: boolean;
  /** Fill the width it is given (the phone layout) instead of the fixed width of the staircase. */
  fluid?: boolean;
}) {
  return (
    <div
      title={label}
      className={`relative flex items-center overflow-hidden rounded-full border text-white shadow-md ${
        gold ? "border-amber-300/80 bg-[#27408f]" : "border-white/10 bg-[#1f3a85]"
      } ${dim ? "opacity-50" : ""} ${fluid ? "w-full" : ""}`}
      style={fluid ? { height: `${PILL_H + 0.5}rem` } : { width: `${PILL_W}rem`, height: `${PILL_H}rem` }}
    >
      <span
        className="absolute inset-y-0 left-0 w-9"
        style={{ background: TAB[tone], clipPath: "polygon(0 0, 100% 0, 68% 100%, 0 100%)" }}
        aria-hidden
      />
      <span className="relative z-10 w-full truncate pl-9 pr-2 text-center text-[11px] font-semibold italic">{label}</span>
    </div>
  );
}

function Trophy() {
  return (
    <svg viewBox="0 0 64 72" className="h-full w-full" aria-hidden>
      <path d="M17 12H7v6a12 12 0 0 0 12 12" fill="none" stroke="#f5b731" strokeWidth="4" strokeLinecap="round" />
      <path d="M47 12h10v6a12 12 0 0 1-12 12" fill="none" stroke="#f5b731" strokeWidth="4" strokeLinecap="round" />
      <path d="M16 6h32v20a16 16 0 0 1-32 0z" fill="#f5b731" />
      <path d="M32 6h16v20a16 16 0 0 1-16 16z" fill="#e59a1a" />
      <rect x="29" y="42" width="6" height="12" fill="#e59a1a" />
      <rect x="20" y="54" width="24" height="6" rx="2" fill="#f5b731" />
      <rect x="15" y="60" width="34" height="7" rx="2" fill="#e59a1a" />
    </svg>
  );
}

/** What winning a round is worth: the prize in P-Credits for the entry, a multiple of the entry before one is chosen, nothing for a test cup. */
function prizeText(fee: number | undefined, round: number): string | null {
  if (fee === undefined) return `×${PRIZE_MULTIPLIERS[round]} entry`;
  if (fee <= 0) return null;
  return `🪙 ${prizeFor(fee, round).toLocaleString()}`;
}

export function Bracket({
  rounds,
  status,
  fee,
}: {
  rounds: CampaignRoundView[] | null;
  status?: CampaignStatus;
  /** The entry fee of the cup being shown. Leave out before an entry is chosen; 0 for a free test cup. */
  fee?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stages = CAMPAIGN_ROUNDS.map((spec, i) => ({ spec, i, r: rounds?.find((x) => x.round === spec.round) ?? null }));
  const current = stages.find((s) => s.r?.state === "current");

  // On a narrow screen, bring the round being played into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !current) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    el.scrollLeft = Math.max(0, current.i * PITCH * rem - 24);
  }, [current]);

  const height = TOP + STEP_Y * (stages.length - 1) + MATCH_H + 1.5;
  const lastTop = TOP + STEP_Y * (stages.length - 1);
  const finalMid = lastTop + MATCH_H / 2;
  const trophyLeft = PITCH * (stages.length - 1) + PILL_W + CONNECTOR_W + 1.5;
  const champion = status === "champion";
  const widthRem = trophyLeft + 8;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-blue-300/10 text-white shadow-lg"
      style={{
        background:
          "repeating-linear-gradient(60deg, rgba(255,255,255,0.035) 0 3rem, rgba(255,255,255,0) 3rem 6rem), linear-gradient(160deg, #1d3c80, #132a5e)",
      }}
    >
      <h3 className="px-4 pt-4 text-center text-2xl uppercase tracking-wide sm:text-3xl">
        <span className="font-light">Drift Campaign </span>
        <span className="font-black text-amber-400">Schedule</span>
      </h3>

      <div
        ref={scroller}
        className="hidden overflow-x-auto px-4 pb-4 pt-2 lg:block"
        tabIndex={0}
        role="region"
        aria-label="Campaign bracket"
      >
        <div className="relative mx-auto" style={{ width: `${widthRem}rem`, height: `${height}rem` }} aria-hidden>
          {stages.map(({ spec, i, r }) => {
            const state = r?.state ?? "upcoming";
            const left = i * PITCH;
            const top = TOP + i * STEP_Y;
            const dimmed = state === "upcoming" && status === "eliminated";
            const youTone: Tone = state === "won" ? "through" : state === "lost" ? "out" : state === "current" ? "live" : "idle";
            const oppTone: Tone = state === "won" ? "beaten" : state === "lost" ? "through" : state === "current" ? "live" : "idle";
            const line = state === "won" ? "bg-green-400" : "bg-white/60";
            const lineBorder = state === "won" ? "border-green-400" : "border-white/60";
            return (
              <div key={spec.round}>
                <p
                  className="absolute text-[10px] font-black uppercase tracking-widest text-amber-300"
                  style={{ left: `${left}rem`, top: `${top - 1.1}rem`, width: `${PILL_W}rem` }}
                >
                  {spec.short}
                  {prizeText(fee, spec.round) && <span className="text-emerald-300"> · {prizeText(fee, spec.round)}</span>}
                </p>
                <div className="absolute" style={{ left: `${left}rem`, top: `${top}rem` }}>
                  <Pill label="You" tone={youTone} dim={dimmed} />
                </div>
                <div className="absolute" style={{ left: `${left}rem`, top: `${top + PILL_H + MATCH_GAP}rem` }}>
                  <Pill
                    label={r ? r.driverName : "TBC"}
                    tone={oppTone}
                    dim={dimmed || state === "won"}
                    gold={spec.round === CAMPAIGN_ROUNDS.length}
                  />
                </div>
                {/* The bracket line joining the two pills, and the winner's line out of its middle. */}
                <div
                  className={`absolute border-y-2 border-r-2 ${lineBorder}`}
                  style={{
                    left: `${left + PILL_W}rem`,
                    top: `${top + PILL_H / 2}rem`,
                    width: `${CONNECTOR_W}rem`,
                    height: `${PILL_H + MATCH_GAP}rem`,
                  }}
                />
                <div
                  className={`absolute h-0.5 ${line}`}
                  style={{
                    left: `${left + PILL_W + CONNECTOR_W}rem`,
                    top: `${top + MATCH_H / 2}rem`,
                    width: `${i === stages.length - 1 ? 1.5 : PITCH - PILL_W - CONNECTOR_W}rem`,
                  }}
                />
              </div>
            );
          })}

          {/* Trophy and the champion's badge. */}
          <div className="absolute" style={{ left: `${trophyLeft}rem`, top: `${finalMid - 6.6}rem`, width: "5.5rem", height: "5.5rem" }}>
            <div className={champion ? "h-full w-full drop-shadow-[0_0_18px_rgba(251,191,36,0.9)]" : "h-full w-full"}>
              <Trophy />
            </div>
          </div>
          <div
            className={`absolute flex items-center justify-center rounded-full border-2 border-amber-200 bg-amber-400 text-sm font-black uppercase tracking-wide text-[#14275a] shadow-lg ${
              champion ? "shadow-[0_0_24px_rgba(251,191,36,0.9)]" : ""
            }`}
            style={{ left: `${trophyLeft}rem`, top: `${finalMid - 1.1}rem`, width: "7.5rem", height: "2.2rem" }}
          >
            {champion ? "You!" : "Champion"}
          </div>
        </div>
      </div>

      {/* Phones and tablets: the same board stood on end, one match per row down a rail, ending at the trophy. */}
      <div className="px-4 pb-5 pt-3 lg:hidden" aria-hidden>
        <ol className="mx-auto max-w-md">
          {stages.map(({ spec, r }) => {
            const state = r?.state ?? "upcoming";
            const dimmed = state === "upcoming" && status === "eliminated";
            const youTone: Tone = state === "won" ? "through" : state === "lost" ? "out" : state === "current" ? "live" : "idle";
            const oppTone: Tone = state === "won" ? "beaten" : state === "lost" ? "through" : state === "current" ? "live" : "idle";
            const dot =
              state === "won"
                ? "bg-green-500 text-white"
                : state === "lost"
                  ? "bg-rose-500 text-white"
                  : state === "current"
                    ? "bg-amber-400 text-black ring-4 ring-amber-400/30"
                    : "bg-[#3b63c4] text-white";
            const rail = state === "won" ? "bg-green-400" : "bg-white/40";
            return (
              <li key={spec.round} className={`flex gap-3 ${dimmed ? "opacity-60" : ""}`}>
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${dot}`}>{spec.round}</span>
                  <span className={`w-0.5 flex-1 ${rail}`} />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                    {spec.name}
                    {prizeText(fee, spec.round) && <span className="text-emerald-300"> · {prizeText(fee, spec.round)}</span>}
                    {state === "current" && <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] text-black">Next up</span>}
                  </p>
                  <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Pill fluid label="You" tone={youTone} dim={dimmed} />
                    <span className="text-[10px] font-black uppercase text-blue-200/70">vs</span>
                    <Pill
                      fluid
                      label={r ? r.driverName : "TBC"}
                      tone={oppTone}
                      dim={dimmed || state === "won"}
                      gold={spec.round === CAMPAIGN_ROUNDS.length}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 pt-1">
          <div className={champion ? "h-24 w-24 drop-shadow-[0_0_18px_rgba(251,191,36,0.9)]" : "h-24 w-24"}>
            <Trophy />
          </div>
          <div
            className={`flex h-9 w-40 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-400 text-sm font-black uppercase tracking-wide text-[#14275a] shadow-lg ${
              champion ? "shadow-[0_0_24px_rgba(251,191,36,0.9)]" : ""
            }`}
          >
            {champion ? "You!" : "Champion"}
          </div>
        </div>
      </div>

      {/* The same rounds as plain text, for screen readers. */}
      <ol className="sr-only">
        {stages.map(({ spec, r }) => (
          <li key={spec.round}>
            Round {spec.round}, {spec.name}: {r ? `${r.driverName} of ${r.teamName}` : "opponent not yet known"},{" "}
            {prizeText(fee, spec.round) ? `prize for winning ${prizeText(fee, spec.round)}.` : "no prize."}{" "}
            {r?.state === "won" ? "You won." : r?.state === "lost" ? "You lost." : r?.state === "current" ? "Next up." : "Still to come."}
          </li>
        ))}
      </ol>
    </div>
  );
}
