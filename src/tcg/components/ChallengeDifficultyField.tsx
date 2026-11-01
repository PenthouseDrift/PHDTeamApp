"use client";

import { useState, useTransition } from "react";
import { estimateChallengeWinRateAction, type WinRateEstimate } from "@/tcg/challenges-actions";
import type { AdminChallengeInput, ChallengeRarityFilter } from "@/tcg/challenges-types";
import { winRateRange } from "@/tcg/rival-ai";

/** Where the standard difficulty puts a typical player, as a percentage. */
const STANDARD_WIN_RATE = 30;

/**
 * Admin control for how hard a challenge is: the win rate a typical player should have. The rival is made as
 * strong or weak as it takes to get there. "Test it" plays simulated battles against the challenge exactly
 * as it is set up in the form (saved or not) and shows the result, which also covers a hand-picked rival.
 * Players never see any of this.
 */
export function ChallengeDifficultyField({
  value,
  onChange,
  rarity,
  handPicked,
  buildInput,
}: {
  /** Target win rate in percent, or "" for the standard difficulty. */
  value: string;
  onChange: (next: string) => void;
  rarity: ChallengeRarityFilter;
  /** The rival's cars and Crew are hand-picked, so the cars you chose matter as well as this setting. */
  handPicked: boolean;
  /** The challenge as currently filled in, for testing. */
  buildInput: () => AdminChallengeInput;
}) {
  const [estimate, setEstimate] = useState<WinRateEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTesting] = useTransition();

  const range = winRateRange(rarity);
  const custom = value.trim() !== "";
  const target = custom ? Number(value) : STANDARD_WIN_RATE;
  const outOfRange = custom && (target < range.minPct || target > range.maxPct);

  function test() {
    setError(null);
    setEstimate(null);
    startTesting(async () => {
      const res = await estimateChallengeWinRateAction({ ...buildInput(), targetWinRatePct: custom ? Number(value) : null });
      if (res.success) setEstimate(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <span className="block text-[11px] font-black uppercase text-rose-400">Difficulty</span>

      <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1" role="group" aria-label="Difficulty mode">
        <button
          type="button"
          aria-pressed={!custom}
          onClick={() => {
            onChange("");
            setEstimate(null);
          }}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase transition-all ${!custom ? "bg-rose-500 text-black" : "text-zinc-400 hover:text-white"}`}
        >
          Standard (about {STANDARD_WIN_RATE}%)
        </button>
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            if (!custom) onChange(String(Math.min(range.maxPct, Math.max(range.minPct, STANDARD_WIN_RATE))));
            setEstimate(null);
          }}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase transition-all ${custom ? "bg-rose-500 text-black" : "text-zinc-400 hover:text-white"}`}
        >
          Set a win rate
        </button>
      </div>

      {custom && (
        <div className="space-y-2">
          <label htmlFor="difficulty-win-rate" className="block text-[10px] font-bold uppercase text-zinc-400">
            Players should win about
          </label>
          <div className="flex items-center gap-3">
            <input
              id="difficulty-win-rate"
              type="range"
              min={range.minPct}
              max={range.maxPct}
              step={1}
              value={Math.min(range.maxPct, Math.max(range.minPct, target || range.minPct))}
              onChange={(e) => {
                onChange(e.target.value);
                setEstimate(null);
              }}
              className="flex-1 accent-rose-500"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={95}
                aria-label="Win rate percent"
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setEstimate(null);
                }}
                className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-white focus:border-rose-500 focus:outline-none"
              />
              <span className="text-sm font-black text-zinc-300">%</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400">
            So the AI wins about <strong className="text-white">{Math.max(0, 100 - (Number(value) || 0))}%</strong> of the time. A{" "}
            {rarity === "any" ? "Bronze" : rarity} challenge can be set between {range.minPct}% and {range.maxPct}%.
            {outOfRange && <span className="text-amber-400"> That is outside the range, so the nearest reachable difficulty is used.</span>}
          </p>
        </div>
      )}

      {handPicked && (
        <p className="rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-300">
          This rival is hand-picked, so its cars and Crew set most of the difficulty. This setting changes how well it plays. Use Test it to check the result.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="rounded-xl border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-[11px] font-black uppercase text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {testing ? "Playing test battles…" : "Test it"}
        </button>
        <span className="text-[11px] text-zinc-500">Plays about 440 simulated battles against this challenge as set up now.</span>
      </div>

      <div role="status" aria-live="polite">
        {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
        {estimate && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            <p className="text-sm font-black text-white">
              Players win about {estimate.typicalPct}% <span className="font-bold text-zinc-400">(AI wins {100 - estimate.typicalPct}%)</span>
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Casual players (cars and Crew in order): {estimate.casualPct}%. Good players (best car and Crew for each corner): {estimate.goodPct}%. Typical is the average of the two,
              over {estimate.battles} battles.
            </p>
            {estimate.clamped && <p className="mt-1 text-[11px] text-amber-400">The target was outside what can be reached, so the nearest reachable difficulty was used.</p>}
            {custom && Math.abs(estimate.typicalPct - Number(value)) > 8 && !handPicked && (
              <p className="mt-1 text-[11px] text-amber-400">
                That is a little off your target. A test is a sample, and real results depend on the cars members own, so treat it as a guide.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
