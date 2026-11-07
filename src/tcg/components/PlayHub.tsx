"use client";

import { DAILY_CLASH_WIN_REWARD_PCREDITS } from "@/tcg/progression";

export type PlayMode = "quick" | "challenges" | "tour" | "campaign";

interface ModeCard {
  mode: PlayMode;
  icon: string;
  title: string;
  blurb: string;
  /** Small highlighted tag on the card, e.g. the daily win bonus. */
  tag?: string;
  cta: string;
  /** Classes for the card surface. Written out in full so Tailwind can see them. */
  surface: string;
  ctaCls: string;
}

/**
 * The Play landing page: every way to play DriftClash in one place. Picking a mode opens it, and each mode
 * has a way back here. The modes themselves (arena, challenges, Tour, Campaign) are rendered by TcgApp.
 */
export function PlayHub({
  onSelect,
  wins,
  losses,
  streak,
  dailyWinAvailable,
  liveChallenges,
  hasTourAccess,
  tourAdminPreview,
}: {
  onSelect: (mode: PlayMode) => void;
  wins: number;
  losses: number;
  streak: number;
  dailyWinAvailable: boolean;
  /** Challenge cups the member has not won yet. */
  liveChallenges: number;
  hasTourAccess: boolean;
  /** Tour is only visible because the member is an admin; it is not open to members yet. */
  tourAdminPreview: boolean;
}) {
  const modes: ModeCard[] = [
    {
      mode: "quick",
      icon: "⚔️",
      title: "Tandem Clash",
      blurb: "Pick 3 cars and take on a rival over three corners. Play debuffs, call your crew, win the final showdown.",
      tag: dailyWinAvailable ? `Daily win +${DAILY_CLASH_WIN_REWARD_PCREDITS}P` : undefined,
      cta: "Play now",
      surface: "border-amber-500/50 from-amber-950/70 via-zinc-950 to-black shadow-[0_0_30px_rgba(245,158,11,0.15)]",
      ctaCls: "bg-amber-500 text-black",
    },
    {
      mode: "challenges",
      icon: "🏆",
      title: "Challenges",
      blurb: "Themed cups with their own rules and prizes.",
      tag: liveChallenges > 0 ? `${liveChallenges} live` : undefined,
      cta: "View cups",
      surface: "border-purple-500/40 from-purple-950/60 via-zinc-950 to-black",
      ctaCls: "bg-purple-500 text-white",
    },
  ];

  if (hasTourAccess) {
    modes.push({
      mode: "tour",
      icon: "🏎️",
      title: "Tandem Tour",
      blurb: "A run of Rounds. Draft upgrades, then drive each one yourself.",
      tag: tourAdminPreview ? "Admin preview" : "New",
      cta: "Start a Tour",
      surface: "border-sky-500/40 from-sky-950/60 via-zinc-950 to-black",
      ctaCls: "bg-sky-500 text-black",
    });
  }

  modes.push({
    mode: "campaign",
    icon: "🏅",
    title: "Drift Campaign",
    blurb: "A six round knockout cup. Beat one driver per round to be champion.",
    tag: "New",
    cta: "Open Campaign",
    surface: "border-emerald-500/40 from-emerald-950/60 via-zinc-950 to-black",
    ctaCls: "bg-emerald-500 text-black",
  });

  const [primary, ...others] = modes;

  return (
    <section aria-label="Play DriftClash" className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-2xl">Play</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose how you want to race.</p>
        </div>
        <p className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300">
          ⚔️ <strong className="text-emerald-400">{wins}W</strong>/{losses}L
          {streak > 0 && <span className="ml-1.5 text-amber-400">🔥{streak}</span>}
        </p>
      </div>

      <ModeButton card={primary} onSelect={onSelect} featured />

      <ul className="grid gap-3 sm:grid-cols-2">
        {others.map((card) => (
          <li key={card.mode} className="flex">
            <ModeButton card={card} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Play button on the game's Home page. It opens the Play page, where the game modes are listed.
 */
export function PlayBanner({
  onPlay,
  wins,
  losses,
  streak,
  dailyWinAvailable,
}: {
  onPlay: () => void;
  wins: number;
  losses: number;
  streak: number;
  dailyWinAvailable: boolean;
}) {
  return (
    <section
      aria-label="Play"
      className="relative overflow-hidden rounded-3xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-950/70 via-zinc-950 to-black p-4 text-white shadow-[0_0_30px_rgba(245,158,11,0.15)] sm:p-6"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">DriftClash</p>
        <p className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300">
          ⚔️ <strong className="text-emerald-400">{wins}W</strong>/{losses}L
          {streak > 0 && <span className="ml-1.5 text-amber-400">🔥{streak}</span>}
        </p>
      </div>
      <h2 className="relative mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">Ready to drift?</h2>
      <p className="relative mt-1 text-sm text-zinc-300">
        {dailyWinAvailable
          ? `Your daily win bonus is waiting: +${DAILY_CLASH_WIN_REWARD_PCREDITS}P for your first win today.`
          : "Tandem Clash, challenges and more game modes."}
      </p>
      <button
        type="button"
        onClick={onPlay}
        className="gx-tap relative mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(245,158,11,0.45)] transition-all hover:bg-amber-400 active:scale-[0.98]"
      >
        <span aria-hidden>▶</span> Play now <span aria-hidden>→</span>
      </button>
    </section>
  );
}

function ModeButton({
  card,
  onSelect,
  featured = false,
}: {
  card: ModeCard;
  onSelect: (mode: PlayMode) => void;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(card.mode)}
      aria-label={`${card.title}. ${card.blurb}`}
      className={`gx-tap group flex w-full flex-col gap-3 rounded-3xl border-2 bg-gradient-to-br p-4 text-left text-white transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:p-5 ${card.surface}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-white/10 ${featured ? "h-14 w-14 text-3xl" : "h-12 w-12 text-2xl"}`}
        >
          {card.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-black uppercase tracking-tight ${featured ? "text-xl sm:text-2xl" : "text-lg"}`}>{card.title}</h3>
            {card.tag && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                {card.tag}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-snug text-zinc-300 sm:text-sm">{card.blurb}</p>
        </div>
      </div>
      <span
        aria-hidden
        className={`mt-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-black uppercase tracking-wider ${card.ctaCls}`}
      >
        {featured && "▶"} {card.cta} <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );
}
