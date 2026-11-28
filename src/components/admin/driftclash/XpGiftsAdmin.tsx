"use client";

import { useMemo, useState, useTransition } from "react";
import { saveXpGiftConfigAction, type XpGiftAdminData } from "@/tcg/xp-gift-actions";
import { DEFAULT_XP_GIFT, MAX_EVERY_XP, MAX_GIFT_PCREDITS, MIN_EVERY_XP, isXpGiftOn, sanitizeXpGiftConfig, type XpGiftConfig } from "@/tcg/xp-gifts";

/**
 * The dial for the free XP gifts: how much Drift XP between gifts, and how many P-Credits each one holds. Setting either to 0
 * switches the gifts off. Nothing is saved until "Save" is pressed.
 */

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const hint = "text-xs text-zinc-500 dark:text-zinc-400";
const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const primary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-black text-black hover:bg-amber-400 disabled:opacity-50";
const secondary =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

const fmt = (n: number) => n.toLocaleString("en-GB");

/** Typical months, to show what the dial is worth. */
const EXAMPLES = [
  { label: "Casual", xp: 2_500 },
  { label: "Regular", xp: 6_000 },
  { label: "Very active", xp: 10_000 },
];

export function XpGiftsAdmin({ initial }: { initial: XpGiftAdminData }) {
  const [saved, setSaved] = useState<XpGiftConfig>(initial.config);
  const [every, setEvery] = useState<string>(String(initial.config.everyXp));
  const [amount, setAmount] = useState<string>(String(initial.config.pCredits));
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const clean = useMemo(() => sanitizeXpGiftConfig({ everyXp: every === "" ? 0 : Number(every), pCredits: amount === "" ? 0 : Number(amount) }), [every, amount]);
  const on = isXpGiftOn(clean);
  const dirty = clean.everyXp !== saved.everyXp || clean.pCredits !== saved.pCredits;
  const raised = every !== "" && Number(every) > 0 && Number(every) < MIN_EVERY_XP;

  function save(next: Pick<XpGiftConfig, "everyXp" | "pCredits">) {
    setMessage(null);
    startTransition(async () => {
      const res = await saveXpGiftConfigAction(next);
      if (res.success) {
        setSaved(res.data.config);
        setEvery(String(res.data.config.everyXp));
        setAmount(String(res.data.config.pCredits));
        setMessage({ text: isXpGiftOn(res.data.config) ? "Saved. It is live now." : "Saved. Free XP gifts are off." });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className={`${panel} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">The dial</h2>
            <p className={hint}>Every driver can collect a gift each time they earn this much Drift XP, on top of the Battle Pass.</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
              (isXpGiftOn(saved) ? "bg-emerald-500 text-black" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
            }`}
          >
            {isXpGiftOn(saved) ? "Live" : "Off"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="xpgift-every" className="mb-1 block text-xs font-bold text-zinc-700 dark:text-zinc-200">
              A gift every (Drift XP)
            </label>
            <input
              id="xpgift-every"
              type="number"
              className={input}
              value={every}
              min={0}
              max={MAX_EVERY_XP}
              step={50}
              inputMode="numeric"
              onChange={(e) => {
                setEvery(e.target.value);
                setMessage(null);
              }}
            />
            <p className={`${hint} mt-0.5`}>
              {raised ? `The lowest allowed is ${fmt(MIN_EVERY_XP)}, so that is what will be saved.` : `Between ${fmt(MIN_EVERY_XP)} and ${fmt(MAX_EVERY_XP)}. 0 turns it off.`}
            </p>
          </div>
          <div>
            <label htmlFor="xpgift-amount" className="mb-1 block text-xs font-bold text-zinc-700 dark:text-zinc-200">
              P-Credits in each gift
            </label>
            <input
              id="xpgift-amount"
              type="number"
              className={input}
              value={amount}
              min={0}
              max={MAX_GIFT_PCREDITS}
              step={5}
              inputMode="numeric"
              onChange={(e) => {
                setAmount(e.target.value);
                setMessage(null);
              }}
            />
            <p className={`${hint} mt-0.5`}>Up to {fmt(MAX_GIFT_PCREDITS)}. 0 turns it off.</p>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">
            {on ? `${fmt(clean.pCredits)} P-Credits for every ${fmt(clean.everyXp)} XP (${((clean.pCredits / clean.everyXp) * 1000).toFixed(1)} P per 1,000 XP)` : "Free XP gifts are off"}
          </p>
          {on && (
            <ul className={`${hint} mt-1.5 space-y-0.5`}>
              {EXAMPLES.map((e) => (
                <li key={e.label}>
                  {e.label} ({fmt(e.xp)} XP a month): {fmt(Math.floor(e.xp / clean.everyXp))} gifts, {fmt(Math.floor(e.xp / clean.everyXp) * clean.pCredits)} P-Credits a month
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primary} disabled={pending || !dirty} onClick={() => save(clean)}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={secondary}
            disabled={pending}
            onClick={() => {
              setEvery(String(DEFAULT_XP_GIFT.everyXp));
              setAmount(String(DEFAULT_XP_GIFT.pCredits));
              setMessage(null);
            }}
          >
            Reset to {fmt(DEFAULT_XP_GIFT.pCredits)} P per {fmt(DEFAULT_XP_GIFT.everyXp)} XP
          </button>
          {isXpGiftOn(saved) && (
            <button type="button" className={secondary} disabled={pending} onClick={() => save({ everyXp: 0, pCredits: saved.pCredits })}>
              Turn off
            </button>
          )}
        </div>
        {message && (
          <p role={message.error ? "alert" : "status"} className={`text-sm font-bold ${message.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {message.text}
          </p>
        )}
      </section>

      <section className={panel}>
        <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">How it works</h2>
        <ul className={`${hint} mt-1.5 list-disc space-y-1 pl-4`}>
          <li>It counts each driver&apos;s total Drift XP (the same total as the Hall of Fame), not the month, so it never resets.</li>
          <li>A driver&apos;s count starts from the XP they have the first time they open the game after it goes live. XP earned before that is not paid.</li>
          <li>Drivers collect their gifts with a button on the Home page. Gifts they have not collected wait for them.</li>
          <li>Gifts already collected are never taken back or paid twice. If you change the numbers, XP that has not been collected yet is counted at the new numbers.</li>
        </ul>
        <p className="mt-3 text-sm font-bold text-zinc-800 dark:text-zinc-100">
          Paid so far: {fmt(initial.paid.gifts)} gifts, {fmt(initial.paid.pcredits)} P-Credits
        </p>
      </section>
    </div>
  );
}
