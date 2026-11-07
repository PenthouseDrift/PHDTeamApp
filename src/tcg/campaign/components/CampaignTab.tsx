"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { MemberCard } from "@/lib/card-roll";
import type { ActionResult } from "@/types";
import { isCarBroken } from "@/lib/mechanical-faults";
import { outlookOf } from "../garage";
import { DriftClashArena } from "@/tcg/components/DriftClashArena";
import {
  beginCampaignRoundAction,
  getCampaignAction,
  payCampaignEntryAction,
  rerollCampaignCarsAction,
  rerollCampaignCrewAction,
  buyCampaignRepairAction,
  repairCampaignCarAction,
  serviceCampaignCarAction,
  reportCampaignResultAction,
  startCampaignAction,
  withdrawCampaignAction,
  withdrawCampaignDraftAction,
} from "../actions";
import { CAMPAIGN_ROUNDS, CARS_TO_PICK, CREW_TO_PICK, MIN_BRONZE_CARS, prizeFor } from "../config";
import { deckProblem, tierSlotOf } from "../deal";
import type { GameXpBreakdown } from "../../game-xp";
import type { CampaignBattle, CampaignDraft, CampaignView, EntryChoice, RolledTier } from "../types";
import { Bracket } from "./Bracket";
import { CardCarousel } from "./CardCarousel";
import { CrewPicker } from "./CrewPicker";
import { ResumeDialog } from "./ResumeDialog";
import { ROLL_STYLE } from "./rolls";
import { ActionDock, DockSpacer, dockDanger, dockPrimary, dockSecondary } from "./ActionDock";
import { ConfirmDialog } from "./ConfirmDialog";
import { Disclosure } from "./Disclosure";
import { FlowHeader } from "./FlowHeader";
import { NextUpCard } from "./NextUpCard";
import { CampaignSkeleton } from "./Skeleton";
import { EntryStep } from "./EntryStep";
import { PrizeLadder } from "./PrizeLadder";
import { CarFooter, CautionTape, needsRepair } from "./CarStatus";

/**
 * Drift Campaign: a six-round knockout cup. Pick three cars once, then beat one driver per round to stay in.
 * Each battle is the normal Tandem Clash arena. A loss ends the run; win round six to be champion.
 */

const panel = "rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-sm sm:p-5";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-xs font-black uppercase tracking-wide text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Runs a server action and turns a thrown error (a dropped connection, or a dev server that has not picked up a new
 * action yet) into an ordinary failure, so the screen can say so instead of waiting forever.
 */
async function safely<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (e) {
    console.error("[campaign] server action failed:", e);
    return {
      success: false,
      error: "Could not reach the tournament server. If the dev server was running when this feature was added, restart it and reload.",
    };
  }
}

/** How long the deal plays: six face-down cards fly in, turn over one by one, hold as a fan, then spread into the carousel. */
const DEAL_REVEAL_MS = 4500;

type Busy = null | "loading" | "dealing" | "rerolling" | "building" | "beginning" | "withdrawing";
type SaveState = "idle" | "saving" | "saved" | "failed";
type Ask = { title: string; body: string; confirmLabel: string; cancelLabel?: string; danger?: boolean; run: () => void };
type Result = { won: boolean; playerCorners: number; opponentCorners: number; playerTotalScore?: number; opponentTotalScore?: number };

export function CampaignTab({
  cards,
  onCardsWorn,
  onGameXp,
  onKitUsed,
  onOpenPCreditsTab,
  isAdmin = false,
  pCredits,
  onPCreditsChange,
  onBack,
}: {
  cards: MemberCard[];
  /** Shows a "← Play" button in the top row, next to Withdraw while the cars are being chosen. */
  onBack?: () => void;
  /** The member's P-Credit balance, for the entry fee. */
  pCredits: number;
  /** Called with the new balance when the cup charges an entry fee or pays a prize. Pass a stable function. */
  onPCreditsChange?: (balance: number) => void;
  /** Called with the id of a Maintenance kit that was used up, so the deck no longer lists it. */
  onKitUsed?: (kitId: string) => void;
  /** Opens the page where P-Credits are bought, for a member who cannot afford an instant repair. */
  onOpenPCreditsTab?: () => void;
  /** Admins also get the admin tools in the arena. The server decides this again from the session. */
  isAdmin?: boolean;
  /** Called with the cars after a battle has worn them, so the rest of the game shows the new durability. */
  onCardsWorn?: (cars: MemberCard[]) => void;
  /** Called with the driver's new Drift XP total after a round pays XP, so the bar in the header moves. */
  onGameXp?: (total: number) => void;
}) {
  // Choosing cars from the member's own deck, before a cup starts.
  // Step 1 is the entry (fee and prizes), step 2 is choosing the cars. Null when neither is open.
  const [stage, setStage] = useState<null | "entry" | "cars" | "crew">(null);
  // The six cars dealt from the member's deck to choose three from.
  const [offer, setOffer] = useState<MemberCard[]>([]);
  // The rarity each of the six slots rolled, in the same order as `offer`.
  const [rolls, setRolls] = useState<RolledTier[]>([]);
  // True while the freshly dealt cars are flying in, before the picker opens.
  const [revealing, setRevealing] = useState(false);
  // Changes with every new deal, so the carousel starts again from the first card and the animation replays.
  const [dealKey, setDealKey] = useState(0);
  const [rerollsLeft, setRerollsLeft] = useState(0);
  // The six Crew cards dealt the same way, the rarity each slot rolled, the Crew re-rolls left, and the three picked.
  const [crewOffer, setCrewOffer] = useState<MemberCard[]>([]);
  const [crewRolls, setCrewRolls] = useState<RolledTier[]>([]);
  const [crewRerollsLeft, setCrewRerollsLeft] = useState(0);
  const [crewPicked, setCrewPicked] = useState<string[]>([]);
  // The entry already paid for the cars being picked. Set while a paid entry is waiting for its cup to start.
  const [paidEntry, setPaidEntry] = useState<CampaignDraft["entry"] | null>(null);
  // Entering needs a minimum number of bronze cars; the server checks this again before taking the fee.
  const deckIssue = useMemo(() => deckProblem(cards), [cards]);
  const [view, setView] = useState<CampaignView | null>(null);
  // How the next cup is entered: a free cup (the default, so nothing is spent by accident) or one of the fees.
  const [entry, setEntry] = useState<EntryChoice>("test");
  const applyView = useCallback(
    (next: CampaignView | null) => {
      setView(next);
      if (next?.balance !== undefined) onPCreditsChange?.(next.balance);
    },
    [onPCreditsChange]
  );
  const [busy, setBusy] = useState<Busy>("loading");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // The Drift XP the round just played paid, shown on its verdict.
  const [roundXp, setRoundXp] = useState<{ xp: GameXpBreakdown; total: number } | null>(null);
  const pendingRef = useRef<Result | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  // A question waiting for a yes or no. Shown as a modal, never as a browser alert.
  // Tells the car carousel to scroll to a card (tapping a tray slot or a card at the edge).
  const [focus, setFocus] = useState<{ index: number; tick: number } | null>(null);
  const jumpTo = useCallback((index: number) => setFocus((prev) => ({ index, tick: (prev?.tick ?? 0) + 1 })), []);
  // When cars are dealt, scroll down so the whole deal is on screen.
  const carsSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!revealing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Going on to the Crew swaps a tall page (the cars, with their repair panels) for a shorter one. A smooth scroll started
    // then gets lost as the page shrinks under it and the deal ends up above the screen, so that jump is instant, and done
    // again a moment later in case anything (a picture loading) moves the page.
    const jump = stage === "crew";
    const go = () => carsSectionRef.current?.scrollIntoView({ behavior: reduced || jump ? "auto" : "smooth", block: "start" });
    const frame = requestAnimationFrame(go);
    const again = jump ? window.setTimeout(go, 150) : 0;
    return () => {
      cancelAnimationFrame(frame);
      if (again) window.clearTimeout(again);
    };
  }, [revealing, dealKey, stage]);

  // The deal animation lasts about this long (see .deal-slide in globals.css); after that the card details fade in.
  useEffect(() => {
    if (!revealing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealing(false), reduced ? 1500 : DEAL_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, dealKey]);

  // Opening the Campaign with a cup still going asks whether to carry on or withdraw.
  const [resumePrompt, setResumePrompt] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const closeAsk = useCallback(() => setAsk(null), []);
  const dialog = ask ? (
    <ConfirmDialog
      title={ask.title}
      body={ask.body}
      confirmLabel={ask.confirmLabel}
      cancelLabel={ask.cancelLabel}
      danger={ask.danger}
      onCancel={closeAsk}
      onConfirm={() => {
        const run = ask.run;
        setAsk(null);
        run();
      }}
    />
  ) : null;

  useEffect(() => {
    let alive = true;
    safely(() => getCampaignAction()).then((res) => {
      if (!alive) return;
      if (res.success) {
        applyView(res.data.view);
        // A paid entry that was left part way through: back to picking cars with the same six.
        if (res.data.draft) openDraft(res.data.draft);
        // A cup that was left part way through: ask whether to carry on or withdraw.
        else if (res.data.view?.status === "active") setResumePrompt(true);
      } else setError(res.error);
      setBusy(null);
    });
    return () => {
      alive = false;
    };
  }, [applyView]);

  async function start() {
    setBusy("building");
    setError(null);
    const res = await safely(() => startCampaignAction(picked, crewPicked));
    if (res.success) {
      applyView(res.data);
      setStage(null);
      setPicked([]);
      setOffer([]);
      setRolls([]);
      setCrewPicked([]);
      setCrewOffer([]);
      setCrewRolls([]);
      setPaidEntry(null);
    } else setError(res.error);
    setBusy(null);
  }

  /**
   * The Play button. A car on its last battle of durability that the cup still needs afterwards will break down in this
   * battle, and the kit it then needs may not repair it fully, so the player is warned first and can service it now.
   */
  function playRound() {
    if (!view) return;
    const ahead = Math.max(1, CAMPAIGN_ROUNDS.length - view.currentRound);
    const lastBattle = view.cars.filter((c) => {
      const outlook = outlookOf(c, ahead);
      return outlook.kind === "short" && outlook.left === 1;
    });
    if (lastBattle.length === 0) {
      void beginRound();
      return;
    }
    const names = lastBattle.map((c) => c.name).join(" and ");
    setAsk({
      title: lastBattle.length === 1 ? "A car is on its last battle" : "Cars are on their last battle",
      body: `${names} ${lastBattle.length === 1 ? "has" : "have"} one battle of durability left and will break down after this one. If you go in, you might not be able to fully repair the fault. Use a Maintenance kit to add battles now, or take the risk.`,
      confirmLabel: "Take the risk",
      cancelLabel: "Repair first",
      danger: true,
      run: () => void beginRound(),
    });
  }

  async function beginRound() {
    setBusy("beginning");
    setError(null);
    const res = await safely(() => beginCampaignRoundAction());
    if (res.success) {
      pendingRef.current = null;
      setSaveState("idle");
      setView(res.data.view);
      setBattle(res.data);
    } else {
      setError(res.error);
    }
    setBusy(null);
  }

  const submitResult = useCallback(async (result: Result) => {
    pendingRef.current = result;
    setSaveState("saving");
    const res = await safely(() => reportCampaignResultAction(result));
    if (res.success) {
      applyView(res.data);
      onCardsWorn?.(res.data.cars);
      if (res.data.xp && res.data.gameXp !== undefined) {
        setRoundXp({ xp: res.data.xp, total: res.data.gameXp });
        onGameXp?.(res.data.gameXp);
      }
      setSaveState("saved");
      setError(null);
    } else {
      setSaveState("failed");
      setError(res.error);
    }
  }, [onCardsWorn, onGameXp, applyView]);

  function closeBattle() {
    setBattle(null);
    setRoundXp(null);
    setSaveState("idle");
    pendingRef.current = null;
  }

  function leaveBattle() {
    if (saveState === "saving") return;
    if (saveState === "saved") {
      closeBattle();
      return;
    }
    setAsk({
      title: "Leave the battle?",
      body: "Leaving counts as a loss and knocks you out of the cup. You keep the prize for the rounds you have already won.",
      confirmLabel: "Leave the battle",
      danger: true,
      run: () => void runLeaveBattle(),
    });
  }

  async function runLeaveBattle() {
    closeBattle();
    setBusy("withdrawing");
    const res = await safely(() => withdrawCampaignAction());
    if (res.success) applyView(res.data);
    else setError(res.error);
    setBusy(null);
  }

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= CARS_TO_PICK ? prev : [...prev, id]));
  }

  function togglePickCrew(id: string) {
    setCrewPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= CREW_TO_PICK ? prev : [...prev, id]));
  }
  /** Cars chosen: on to the Crew cards, which fly in the same way. */
  function goToCrew() {
    if (picked.length !== CARS_TO_PICK) return;
    setStage("crew");
    setRevealing(true);
    setDealKey((k) => k + 1);
  }
  /** Back to the cars, keeping the picks. */
  function backToCars() {
    setRevealing(false);
    setStage("cars");
  }
  /** Show a paid entry's six cars and six Crew cards and the re-rolls left, ready for picking. */
  function openDraft(draft: CampaignDraft) {
    setRevealing(true);
    setDealKey((k) => k + 1);
    setPaidEntry(draft.entry);
    setOffer(draft.offer.cars);
    setRolls(draft.offer.rolls);
    setRerollsLeft(draft.offer.rerollsLeft);
    setPicked([]);
    setCrewOffer(draft.crewOffer.crew);
    setCrewRolls(draft.crewOffer.rolls);
    setCrewRerollsLeft(draft.crewOffer.rerollsLeft);
    setCrewPicked([]);
    setStage("cars");
  }

  /** Step 1 done: take the entry fee, then deal the six cars. */
  function payEntry() {
    setAsk(
      entry === "test"
        ? {
            title: "Start a free cup?",
            body: `A free cup costs nothing. It pays 🪙 ${prizeFor(0, 5)} for winning the Semi-Final and 🪙 ${prizeFor(0, 6)} for winning the Final.`,
            confirmLabel: "Start free cup",
            run: () => void runPayEntry(),
          }
        : {
            title: `Pay 🪙 ${entry} to enter?`,
            body: `The entry is taken now, then you choose your cars. If you withdraw before the cup starts, the 🪙 ${entry} entry is lost.`,
            confirmLabel: `Pay 🪙 ${entry}`,
            run: () => void runPayEntry(),
          }
    );
  }

  async function runPayEntry() {
    setBusy("dealing");
    setError(null);
    const res = await safely(() => payCampaignEntryAction(entry));
    if (res.success) {
      if (res.data.balance !== undefined) onPCreditsChange?.(res.data.balance);
      openDraft(res.data.draft);
    } else {
      setError(res.error);
    }
    setBusy(null);
  }

  /** Leave a paid entry before the cup starts. The fee is lost and the member starts again from the entry step. */
  function withdrawDraft() {
    const fee = paidEntry?.fee ?? 0;
    setAsk({
      title: "Withdraw from the cup?",
      body:
        fee > 0
          ? `Your 🪙 ${fee} entry is lost and you start again from the beginning. A new entry means a new fee.`
          : "This free cup ends and you start again from the beginning.",
      confirmLabel: fee > 0 ? "Withdraw, lose entry" : "Withdraw",
      danger: true,
      run: () => void runWithdrawDraft(),
    });
  }

  async function runWithdrawDraft() {
    setBusy("withdrawing");
    setError(null);
    const res = await safely(() => withdrawCampaignDraftAction());
    if (res.success) {
      setStage(null);
      setPaidEntry(null);
      setOffer([]);
      setRolls([]);
      setPicked([]);
      setCrewOffer([]);
      setCrewRolls([]);
      setCrewPicked([]);
      setView(null);
    } else {
      setError(res.error);
    }
    setBusy(null);
  }

  async function reroll() {
    setBusy("rerolling");
    setError(null);
    const res = await safely(() => rerollCampaignCarsAction());
    if (res.success) {
      setOffer(res.data.cars);
      setRolls(res.data.rolls);
      setRerollsLeft(res.data.rerollsLeft);
      setPicked([]);
      setRevealing(true);
      setDealKey((k) => k + 1);
    } else {
      setError(res.error);
    }
    setBusy(null);
  }

  async function rerollCrew() {
    setBusy("rerolling");
    setError(null);
    const res = await safely(() => rerollCampaignCrewAction());
    if (res.success) {
      setCrewOffer(res.data.crew);
      setCrewRolls(res.data.rolls);
      setCrewRerollsLeft(res.data.rerollsLeft);
      setCrewPicked([]);
      setRevealing(true);
      setDealKey((k) => k + 1);
    } else {
      setError(res.error);
    }
    setBusy(null);
  }

  /** Repair a broken car (matching kit) or service a worn one (any kit). Works on the dealt six and on the cup's cars. */
  async function fixCar(carId: string, kitId: string, mode: "repair" | "service") {
    setWorking(carId);
    setError(null);
    const res = await safely(() =>
      mode === "repair"
        ? repairCampaignCarAction({ carId, maintenanceCardId: kitId })
        : serviceCampaignCarAction({ carId, maintenanceCardId: kitId })
    );
    if (res.success) {
      const { car, view: nextView } = res.data;
      if (nextView) setView(nextView);
      setOffer((prev) => prev.map((c) => (c.id === car.id ? car : c)));
      onCardsWorn?.([car]);
      onKitUsed?.(kitId);
    } else {
      setError(res.error);
    }
    setWorking(null);
  }

  /** Pay P-Credits to repair a broken car at once, when no kit in the deck can finish the repair. */
  async function buyRepair(carId: string) {
    setWorking(carId);
    setError(null);
    const res = await safely(() => buyCampaignRepairAction({ carId }));
    if (res.success) {
      const { car, view: nextView, balance } = res.data;
      if (nextView) setView(nextView);
      setOffer((prev) => prev.map((c) => (c.id === car.id ? car : c)));
      onCardsWorn?.([car]);
      onPCreditsChange?.(balance);
    } else {
      setError(res.error);
    }
    setWorking(null);
  }

  function withdraw() {
    const prize = view ? view.prize : 0;
    setAsk({
      title: "Withdraw from the cup?",
      body:
        prize <= 0
          ? "You will be out of this cup. You have not won a round that pays a prize yet."
          : `You will be out of the cup and keep the prize for the rounds you have won (🪙 ${prize.toLocaleString()}).`,
      confirmLabel: "Withdraw",
      danger: true,
      run: () => void runWithdraw(),
    });
  }

  async function runWithdraw() {
    setBusy("withdrawing");
    const res = await safely(() => withdrawCampaignAction());
    if (res.success) applyView(res.data);
    else setError(res.error);
    setBusy(null);
  }

  // ── The battle ────────────────────────────────────────────────────────────
  if (battle && view) {
    const nextLabel =
      view.status === "active"
        ? `Continue to ${CAMPAIGN_ROUNDS[view.currentRound]?.name ?? "the next round"}`
        : view.status === "champion"
          ? "👑 Collect the trophy"
          : "See the bracket";
    return (
      <>
        <DriftClashArena
          key={`${battle.view.id}-${battle.round.round}`}
          cards={[...battle.cars, ...battle.crew]}
          initialOpponent={battle.opponent}
          hasEarlyAccess
          isAdmin={isAdmin}
          onOpenStoreTab={() => undefined}
          campaign={{
            opponent: battle.opponent,
            roundLabel: battle.round.name,
            onResult: submitResult,
            continueLabel:
              saveState === "saving" ? "Saving result…" : saveState === "failed" ? "Retry saving result" : nextLabel,
            continueDisabled: saveState === "saving" || saveState === "idle",
            onContinue: () => {
              if (saveState === "failed" && pendingRef.current) void submitResult(pendingRef.current);
              else if (saveState === "saved") closeBattle();
            },
            onExit: () => void leaveBattle(),
            maintenance:
              saveState === "saved" ? ([...view.rounds].reverse().find((r) => r.result)?.result?.maintenance ?? null) : null,
            xp: saveState === "saved" ? (roundXp?.xp ?? null) : null,
            gameXp: roundXp?.total,
          }}
        />
        {dialog}
      </>
    );
  }

  // ── Everything else ─────────────────────────────────────────────────────────
  const status = view?.status;
  const active = Boolean(view && view.status === "active");
  const idle = busy !== "loading" && stage === null && !active; // no cup running: the start or finished screen
  const anyBroken = Boolean(view?.cars.some((c) => isCarBroken(c)));
  const nextRound = view && active ? view.rounds[view.currentRound] : undefined;
  const entryPaidText = paidEntry && paidEntry.fee > 0 ? `Entry paid 🪙 ${paidEntry.fee}` : "Free cup";
  const working_ = busy !== null || working !== null;
  const step: 0 | 1 | 2 | 3 | undefined = stage === "entry" ? 0 : stage === "cars" ? 1 : stage === "crew" ? 2 : active ? 3 : undefined;
  const subtitle =
    busy === "building"
      ? "Building your first rival…"
      : stage === "entry"
        ? "Choose how you enter"
        : stage === "cars"
          ? `Pick ${CARS_TO_PICK} of your ${offer.length} cars`
          : stage === "crew"
            ? `Pick ${CREW_TO_PICK} of your ${crewOffer.length} Crew cards`
          : active && view
            ? `Round ${Math.min(view.currentRound + 1, CAMPAIGN_ROUNDS.length)} of ${CAMPAIGN_ROUNDS.length}${view.entry.fee > 0 ? ` · entry 🪙 ${view.entry.fee}` : " · free cup"}`
            : "6 rounds · lose once and you are out";

  /** What winning the current round pays, for the "next up" card. */
  const nextPrizeAmount = view && nextRound ? prizeFor(view.entry.fee, nextRound.round) : 0;
  const nextPrize = nextPrizeAmount > 0 ? `🪙 ${nextPrizeAmount.toLocaleString()}` : null;

  return (
    <section aria-label="Drift Tournaments" className="space-y-3">
      {/* Back to the Play page, and (while choosing cars on a paid entry) the way out of the cup. */}
      {(onBack || ((stage === "cars" || stage === "crew") && busy !== "loading")) && (
        <div className="flex items-center justify-between gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="gx-tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-black uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span aria-hidden>←</span> Play
            </button>
          ) : (
            <span />
          )}
          {(stage === "cars" || stage === "crew") && busy !== "loading" && (
            <button
              type="button"
              className="min-h-11 shrink-0 px-1 text-xs font-black uppercase text-rose-400 underline decoration-rose-400/50 underline-offset-2 disabled:opacity-50"
              onClick={withdrawDraft}
              disabled={busy !== null}
            >
              Withdraw{paidEntry && paidEntry.fee > 0 ? " (entry lost)" : ""}
            </button>
          )}
        </div>
      )}

      <FlowHeader subtitle={subtitle} balance={pCredits} step={step} />

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-300">
          {error}
        </p>
      )}
      {view?.note && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-bold text-amber-900 dark:text-amber-200">
          {view.note}
        </p>
      )}

      {busy === "loading" && <CampaignSkeleton />}

      {busy === "building" && (
        <div role="status" className={`${panel} flex items-center gap-3`}>
          <span aria-hidden className="inline-block animate-spin text-2xl">
            ⚙️
          </span>
          <p className="text-sm font-bold text-zinc-200">
            Building your first rival and testing it against your cars. This takes a few seconds.
          </p>
        </div>
      )}

      {/* No cup running: how it works (first time) or how the last one ended, then the bracket. */}
      {idle && (
        <>
          {!view && (
            <section className={panel} aria-label="How it works">
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">How it works</h3>
              <ol className="mt-2.5 space-y-2.5 text-sm">
                {[
                  ["💳", "Choose an entry", "Pay once. The bigger the entry, the bigger the prizes."],
                  ["🃏", "Pick 3 cars, then 3 Crew", `Six of each are dealt from your own deck across bronze to legend. You need ${MIN_BRONZE_CARS} bronze cars to enter. Re-roll the cars and the Crew up to 3 times each.`],
                  ["🏆", "Beat 6 drivers", "Each round pays more. Lose once and you are out."],
                ].map(([icon, title, text]) => (
                  <li key={title} className="flex items-start gap-3">
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg">
                      {icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-black text-white">{title}</span>
                      <span className="block text-xs text-zinc-400">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {status === "champion" && (
            <div className="rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-amber-950/70 to-zinc-950 p-4 text-center text-white">
              <p className="text-4xl" aria-hidden>
                👑
              </p>
              <h3 className="text-xl font-black uppercase">Drift Champion</h3>
              <p className="text-sm text-zinc-300">You beat all six drivers. The cup is yours.</p>
              <PrizeLine view={view} />
            </div>
          )}
          {status === "eliminated" && (
            <div className="rounded-2xl border-2 border-rose-500/50 bg-gradient-to-b from-rose-950/60 to-zinc-950 p-4 text-center text-white">
              <p className="text-4xl" aria-hidden>
                {view?.endedBy === "withdrew" ? "🏳️" : "😤"}
              </p>
              <h3 className="text-xl font-black uppercase">
                {view?.endedBy === "withdrew" ? "Withdrawn" : view?.endedBy === "left-track" ? "Left the track" : "Knocked out"}
              </h3>
              <p className="text-sm text-zinc-300">
                {view?.endedBy === "withdrew"
                  ? `You pulled out after ${view.wins} round${view.wins === 1 ? "" : "s"}.`
                  : `You went out in ${view?.rounds.find((r) => r.state === "lost")?.name ?? "the cup"}.`}
              </p>
              <PrizeLine view={view} />
            </div>
          )}
          {view && <PrizeLadder compact fee={view.entry.fee} wins={view.wins} />}
          <Bracket rounds={view?.rounds ?? null} status={view?.status} fee={view?.entry.fee} />
          <DockSpacer />
          {deckIssue && (
            <p role="status" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-bold text-amber-900 dark:text-amber-100">
              {deckIssue}
            </p>
          )}
          <ActionDock label="Tournament actions">
            <button type="button" className={dockPrimary} onClick={() => setStage("entry")} disabled={busy !== null || deckIssue !== null}>
              {view?.endedBy === "withdrew" ? "↺ Reset tournament" : view ? "🏁 Start a new tournament" : "🏁 Enter the cup"}
            </button>
          </ActionDock>
        </>
      )}

      {/* Step 1: the entry fee and what each round pays, before any cars are picked. */}
      {busy !== "loading" && stage === "entry" && (
        <>
          <EntryStep entry={entry} onEntry={setEntry} pCredits={pCredits} />
          <DockSpacer />
          <ActionDock label="Entry actions">
            <button type="button" className={dockSecondary} onClick={() => setStage(null)} disabled={busy !== null}>
              Back
            </button>
            <button type="button" className={dockPrimary} onClick={payEntry} disabled={busy !== null}>
              {busy === "dealing" ? "Paying…" : entry === "test" ? "Start free test →" : `Pay 🪙 ${entry} →`}
            </button>
          </ActionDock>
        </>
      )}

      {/* Step 2: three of six cars dealt at random from the member's own deck. */}
      {busy !== "loading" && stage === "cars" && (
        <>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
            <p className="min-w-0 truncate text-xs font-bold text-amber-900 dark:text-amber-100">
              {entryPaidText}
              {paidEntry && ` · top prize 🪙 ${prizeFor(paidEntry.fee, CAMPAIGN_ROUNDS.length).toLocaleString()}`}
            </p>
          </div>

          <section ref={carsSectionRef} className={`${panel} scroll-mt-16 !px-0 !pb-3`} aria-label="Choose your cars">
            <div className="flex items-center justify-between gap-2 px-3.5">
              <div className="min-w-0">
                <h3 className="text-base font-black leading-tight">Pick {CARS_TO_PICK} of {offer.length}</h3>
                <p className="text-[11px] text-zinc-400">Swipe to browse, then tap Pick.</p>
              </div>
              <button
                type="button"
                onClick={reroll}
                disabled={busy !== null || working !== null || revealing || rerollsLeft <= 0}
                className={secondaryBtn}
                aria-label={`Re-roll your cars, ${rerollsLeft} left`}
              >
                {busy === "rerolling" ? "Dealing…" : `🎲 Re-roll · ${rerollsLeft}`}
              </button>
            </div>

            {/* The six cars in a row to swipe through, one in the middle at a time, like opening a pack. */}
            {/* On a new deal the six cards fly in as a stack, fan out for a moment, then spread into the carousel. A tap skips it. */}
            <div
              key={dealKey}
              style={{ "--step": "calc(min(16rem, 62vw) + 1rem)" } as CSSProperties}
              onClickCapture={(e) => {
                if (!revealing) return;
                e.stopPropagation();
                setRevealing(false);
              }}
            >
            <CardCarousel label="Your six cars" focusIndex={focus}>
              {offer.map((car, i) => {
                const on = picked.includes(car.id);
                const full = picked.length >= CARS_TO_PICK;
                const rolled = rolls[i];
                const got = tierSlotOf(car);
                // While the deal plays, everything but the card itself stays hidden; it fades in once the cards have landed.
                const extra = revealing ? "opacity-0" : "transition-opacity duration-500";
                const mid = (offer.length - 1) / 2;
                const slideStyle = { "--i": i, "--fan-x": `${(i - mid) * 22}px`, "--fan-r": `${(i - mid) * 9}deg` } as CSSProperties;
                return (
                  <div key={car.id} style={slideStyle} className={`space-y-2 ${revealing ? "deal-slide" : ""}`} onClick={() => jumpTo(i)}>
                    {rolled && (
                      <p className={`${extra} text-center text-[11px] font-black uppercase tracking-wide text-zinc-400`}>
                        Slot {i + 1} · rolled <span className={ROLL_STYLE[rolled].chip.split(" ").pop()}>{ROLL_STYLE[rolled].label}</span>
                        {got !== rolled && <span className="text-zinc-500"> · none left, dealt {ROLL_STYLE[got].label}</span>}
                      </p>
                    )}
                    <div className={`relative rounded-2xl transition [perspective:1000px] ${on ? "ring-4 ring-amber-400" : ""}`}>
                      {/* The car is face down when it arrives and turns over once the fan is made, one card at a time. */}
                      <div className={revealing ? "deal-front" : undefined}>
                        <FullArtCard card={car} className="drop-shadow-2xl" />
                      </div>
                      {revealing && (
                        <div aria-hidden className="deal-back absolute inset-0 z-20 overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-zinc-800 via-zinc-950 to-black shadow-2xl">
                          <div className="absolute inset-2 rounded-xl border border-dashed border-amber-400/40" />
                          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(251,191,36,0.06)_10px_20px)]" />
                          <span className="absolute inset-0 flex items-center justify-center text-6xl font-black italic text-amber-400/80 drop-shadow">P</span>
                        </div>
                      )}
                      {!revealing && needsRepair(car, CAMPAIGN_ROUNDS.length) && <CautionTape />}
                      {on && (
                        <span className="absolute left-2 top-2 z-30 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-black text-black shadow">
                          ✓ Pick {picked.indexOf(car.id) + 1}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePick(car.id);
                      }}
                      disabled={!on && full}
                      aria-pressed={on}
                      className={`${extra} inline-flex min-h-12 w-full items-center justify-center rounded-xl px-3 text-sm font-black uppercase tracking-wide shadow transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                        on ? "border border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700" : "bg-amber-500 text-black hover:bg-amber-400"
                      }`}
                    >
                      {on ? "Remove from picks" : full ? "Picks full: remove one" : "Pick this car"}
                    </button>
                    <div className={extra}>
                      <CarFooter
                        car={car}
                        ahead={CAMPAIGN_ROUNDS.length}
                        deck={cards}
                        disabled={busy !== null || working !== null}
                        working={working === car.id}
                        pCredits={pCredits}
                        onRepair={(kitId) => fixCar(car.id, kitId, "repair")}
                        onService={(kitId) => fixCar(car.id, kitId, "service")}
                        onBuy={() => buyRepair(car.id)}
                        onTopUp={onOpenPCreditsTab}
                      />
                    </div>
                  </div>
                );
              })}
            </CardCarousel>
            </div>
          </section>

          <Disclosure title="Good to know">
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-300">
              <li>The cup is up to {CAMPAIGN_ROUNDS.length} battles and every car plays every battle.</li>
              <li>
                A car marked <span className="font-black text-yellow-300">needs repair</span> will break down before the cup is over. Repair it with a
                Maintenance kit from your deck.
              </li>
              <li>Re-rolls are kept on your profile and come back with your next entry.</li>
            </ul>
          </Disclosure>

          <DockSpacer />
          <ActionDock label="Choose your cars">
            <ol className="flex shrink-0 gap-1.5" aria-label="Your picks">
              {Array.from({ length: CARS_TO_PICK }, (_, slot) => {
                const index = offer.findIndex((c) => c.id === picked[slot]);
                const car = index >= 0 ? offer[index] : null;
                return (
                  <li key={slot}>
                    {car ? (
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        aria-label={`Show ${car.name}, pick ${slot + 1}`}
                        className="relative block h-12 w-9 overflow-hidden rounded-lg ring-2 ring-amber-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={car.imageUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[10px] font-black text-amber-300">{slot + 1}</span>
                      </button>
                    ) : (
                      <span className="flex h-12 w-9 items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 text-[11px] font-black text-zinc-500">
                        {slot + 1}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <button type="button" className={dockPrimary} onClick={goToCrew} disabled={working_ || picked.length !== CARS_TO_PICK}>
              {picked.length === CARS_TO_PICK ? "Next: choose Crew →" : `Pick ${CARS_TO_PICK - picked.length} more`}
            </button>
          </ActionDock>
        </>
      )}

      {/* Step 3: three of six Crew cards, dealt and picked the same way as the cars. */}
      {busy !== "loading" && stage === "crew" && (
        <>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
            <p className="min-w-0 truncate text-xs font-bold text-amber-900 dark:text-amber-100">
              {entryPaidText}
              {paidEntry && ` · top prize 🪙 ${prizeFor(paidEntry.fee, CAMPAIGN_ROUNDS.length).toLocaleString()}`}
            </p>
          </div>
          <CrewPicker
            sectionRef={carsSectionRef}
            crew={crewOffer}
            rolls={crewRolls}
            picked={crewPicked}
            onToggle={togglePickCrew}
            onReroll={rerollCrew}
            rerollsLeft={crewRerollsLeft}
            rerolling={busy === "rerolling"}
            busy={busy !== null}
            revealing={revealing}
            onSkipReveal={() => setRevealing(false)}
            dealKey={dealKey}
            focus={focus}
            onFocus={jumpTo}
          />
          <Disclosure title="Good to know">
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-300">
              <li>Each Crew card is played on one corner of a battle, and the same three are yours for the whole cup.</li>
              <li>If you own too few Crew cards, the starter loaners are dealt too, so there are always enough to choose from.</li>
              <li>Crew re-rolls are separate from the car re-rolls, and also come back with your next entry.</li>
            </ul>
          </Disclosure>
          <DockSpacer />
          <ActionDock label="Choose your Crew cards">
            <button type="button" className={dockSecondary} onClick={backToCars} disabled={busy !== null}>
              Back
            </button>
            <ol className="flex shrink-0 gap-1.5" aria-label="Your Crew picks">
              {Array.from({ length: CREW_TO_PICK }, (_, slot) => {
                const index = crewOffer.findIndex((c) => c.id === crewPicked[slot]);
                const card = index >= 0 ? crewOffer[index] : null;
                return (
                  <li key={slot}>
                    {card ? (
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        aria-label={`Show ${card.name}, pick ${slot + 1}`}
                        className="relative block h-12 w-9 overflow-hidden rounded-lg ring-2 ring-amber-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[10px] font-black text-amber-300">{slot + 1}</span>
                      </button>
                    ) : (
                      <span className="flex h-12 w-9 items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 text-[11px] font-black text-zinc-500">
                        {slot + 1}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <button type="button" className={dockPrimary} onClick={start} disabled={working_ || crewPicked.length !== CREW_TO_PICK}>
              {busy === "building" ? "Building…" : crewPicked.length === CREW_TO_PICK ? "Start the cup" : `Pick ${CREW_TO_PICK - crewPicked.length} more`}
            </button>
          </ActionDock>
        </>
      )}

      {/* A cup under way: who is next, then your cars. The full bracket is one tap away. */}
      {busy !== "loading" && view && active && nextRound && (
        <>
          <NextUpCard round={nextRound} prize={nextPrize} blocked={anyBroken ? "Repair your cars to play" : null} />
          <PrizeLadder compact fee={view.entry.fee} wins={view.wins} />

          <section className={`${panel} !p-3`} aria-label="Your cars">
            <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">Your cars</h3>
            <ul className="mt-2.5 grid grid-cols-3 gap-2.5">
              {view.cars.map((car) => (
                <li key={car.id} className="space-y-1.5">
                  <div className="relative rounded-2xl">
                    <FullArtCard card={car} className="drop-shadow" />
                    {needsRepair(car, Math.max(1, CAMPAIGN_ROUNDS.length - view.currentRound)) && <CautionTape />}
                  </div>
                  <CarFooter
                    car={car}
                    ahead={Math.max(1, CAMPAIGN_ROUNDS.length - view.currentRound)}
                    deck={cards}
                    disabled={busy !== null || working !== null}
                    working={working === car.id}
                    pCredits={pCredits}
                    onRepair={(kitId) => fixCar(car.id, kitId, "repair")}
                    onService={(kitId) => fixCar(car.id, kitId, "service")}
                    onBuy={() => buyRepair(car.id)}
                    onTopUp={onOpenPCreditsTab}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-400">
              Every battle costs each car one battle of durability. A car that breaks down cannot play until it is repaired.
            </p>
          </section>

          <Disclosure title="Your Crew cards">
            <ul className="grid max-w-md grid-cols-3 gap-2">
              {view.crew.map((c) => (
                <li key={c.id}>
                  <FullArtCard card={c} className="drop-shadow" />
                </li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure title="Full bracket" hint="All six rounds and what they pay">
            <Bracket rounds={view.rounds} status={view.status} fee={view.entry.fee} />
          </Disclosure>

          <DockSpacer />
          <ActionDock label="Cup actions">
            <button type="button" className={dockDanger} onClick={withdraw} disabled={busy !== null}>
              Withdraw
            </button>
            <button type="button" className={dockPrimary} onClick={playRound} disabled={busy !== null || working !== null || anyBroken}>
              {busy === "beginning" ? "Starting…" : anyBroken ? "🔧 Repair to play" : `⚔️ Play ${nextRound.name}`}
            </button>
          </ActionDock>
        </>
      )}
      {dialog}
      {resumePrompt && view && view.status === "active" && !battle && !ask && (
        <ResumeDialog
          roundName={CAMPAIGN_ROUNDS[view.currentRound]?.name ?? "next round"}
          roundsWon={view.wins}
          totalRounds={CAMPAIGN_ROUNDS.length}
          note={view.note}
          prize={view.prize}
          onResume={() => setResumePrompt(false)}
          onWithdraw={() => {
            setResumePrompt(false);
            withdraw();
          }}
        />
      )}
    </section>
  );
}

/** Shows what a finished cup paid. */
function PrizeLine({ view }: { view: CampaignView | null }) {
  if (!view) return null;
  const paid = view.payout ?? 0;
  return (
    <p className={`mt-2 text-sm font-black ${paid > 0 ? "text-emerald-300" : "text-zinc-400"}`}>
      {paid > 0 ? `🪙 +${paid} P-Credits prize` : "No prize this time"}{" "}
      <span className="font-bold text-zinc-500">({view.entry.fee > 0 ? `entry ${view.entry.fee}` : "free cup"})</span>
    </p>
  );
}
