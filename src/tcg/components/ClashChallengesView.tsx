"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { CREW_CARD_SET } from "@/lib/crew-cards";
import {
  CHALLENGE_THEME_CONFIGS,
  isCarEligibleForChallenge,
  getCarNormalizedTotalScore,
  type ChallengeThemeStyle,
  type ChallengeRarityFilter,
  type TandemClashChallenge,
  type AdminChallengeInput,
} from "../challenges-types";
import {
  listTandemClashChallengesAction,
  saveAdminChallengeAction,
  deleteAdminChallengeAction,
  listAdminChallengeCandidateCardsAction,
} from "../challenges-actions";
import { useUtcMidnightCountdown } from "../hooks/useUtcCountdown";

export interface ClashChallengesViewProps {
  userCards: MemberCard[];
  pCredits: number;
  userId?: string;
  isAdmin?: boolean;
  completedChallengeIds?: string[];
  onSelectChallenge: (challenge: TandemClashChallenge) => void;
  onPCreditsChange?: (balance: number) => void;
}

export function ClashChallengesView({
  userCards,
  pCredits,
  userId,
  isAdmin = false,
  completedChallengeIds = [],
  onSelectChallenge,
  onPCreditsChange,
}: ClashChallengesViewProps) {
  const utcCountdown = useUtcMidnightCountdown();
  const [challenges, setChallenges] = useState<TandemClashChallenge[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin Modal State
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<TandemClashChallenge | null>(null);
  const [adminCandidateCards, setAdminCandidateCards] = useState<
    Array<{
      id: string;
      name: string;
      driver?: string;
      team?: string;
      tier: string;
      totalScore: number;
      isSetCard?: boolean;
    }>
  >([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBadge, setFormBadge] = useState("");
  const [formTheme, setFormTheme] = useState<ChallengeThemeStyle>("cyber");
  const [formRarity, setFormRarity] = useState<ChallengeRarityFilter>("any");
  const [formMaxScore, setFormMaxScore] = useState<string>("");
  const [formEntryFee, setFormEntryFee] = useState<string>("0");
  const [formReward, setFormReward] = useState<string>("50");
  const [formRivalMode, setFormRivalMode] = useState<"auto" | "custom">("auto");
  const [formDriverName, setFormDriverName] = useState("Phantom Rival");
  const [formTeamName, setFormTeamName] = useState("Midnight Syndicate");
  const [formRivalTitle, setFormRivalTitle] = useState("Challenger Boss");
  const [formSelectedCardIds, setFormSelectedCardIds] = useState<string[]>([]);
  const [formRivalCrew, setFormRivalCrew] = useState<
    Array<{ cardId: string; tier: FullArtTier }>
  >([
    { cardId: "crew-27-one-more-time", tier: "gold" },
    { cardId: "crew-24-dual-gain-gyro", tier: "gold" },
    { cardId: "crew-28-vip-judge-box", tier: "gold" },
  ]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  // Load challenges from server
  const loadChallenges = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await listTandemClashChallengesAction();
      if (res.success && res.data) {
        setChallenges(res.data.challenges);
        const merged = Array.from(
          new Set([...(res.data.completedIds || []), ...(completedChallengeIds || [])])
        );
        setCompletedIds(merged);
      } else if (!res.success) {
        setErrorMsg(res.error || "Failed to load challenges");
      }
    } catch (err) {
      console.error("loadChallenges error:", err);
      setErrorMsg("Error loading challenges.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChallenges();
  }, []);

  useEffect(() => {
    if (completedChallengeIds && completedChallengeIds.length > 0) {
      setCompletedIds((prev) => Array.from(new Set([...prev, ...completedChallengeIds])));
    }
  }, [completedChallengeIds]);

  const openAdminCreateModal = async (challengeToEdit?: TandemClashChallenge) => {
    if (challengeToEdit) {
      setEditingChallenge(challengeToEdit);
      setFormTitle(challengeToEdit.title);
      setFormSubtitle(challengeToEdit.subtitle);
      setFormDescription(challengeToEdit.description);
      setFormBadge(challengeToEdit.badge);
      setFormTheme(challengeToEdit.themeStyle);
      setFormRarity(challengeToEdit.allowedRarity);
      setFormMaxScore(challengeToEdit.maxTotalScore ? String(challengeToEdit.maxTotalScore) : "");
      setFormEntryFee(String(challengeToEdit.entryCostPCredits || 0));
      setFormReward(String(challengeToEdit.rewardPCredits || 0));
      if (challengeToEdit.customRival) {
        setFormRivalMode("custom");
        setFormDriverName(challengeToEdit.customRival.driverName || "Phantom Rival");
        setFormTeamName(challengeToEdit.customRival.teamName || "Midnight Syndicate");
        setFormRivalTitle(challengeToEdit.customRival.title || "Challenger Boss");
        setFormSelectedCardIds(challengeToEdit.customRival.carCardIds || []);
        if (
          challengeToEdit.customRival.crewCards &&
          challengeToEdit.customRival.crewCards.length === 3
        ) {
          setFormRivalCrew(challengeToEdit.customRival.crewCards);
        } else {
          const defaultTier: FullArtTier = (challengeToEdit.allowedRarity !== "any"
            ? challengeToEdit.allowedRarity
            : "gold") as FullArtTier;
          setFormRivalCrew([
            { cardId: "crew-27-one-more-time", tier: defaultTier },
            { cardId: "crew-24-dual-gain-gyro", tier: defaultTier },
            { cardId: "crew-28-vip-judge-box", tier: defaultTier },
          ]);
        }
      } else {
        setFormRivalMode("auto");
        setFormDriverName("Phantom Rival");
        setFormTeamName("Midnight Syndicate");
        setFormRivalTitle("Challenger Boss");
        setFormSelectedCardIds([]);
        setFormRivalCrew([
          { cardId: "crew-27-one-more-time", tier: "gold" },
          { cardId: "crew-24-dual-gain-gyro", tier: "gold" },
          { cardId: "crew-28-vip-judge-box", tier: "gold" },
        ]);
      }
    } else {
      setEditingChallenge(null);
      setFormTitle("");
      setFormSubtitle("");
      setFormDescription("");
      setFormBadge("");
      setFormTheme("cyber");
      setFormRarity("any");
      setFormMaxScore("");
      setFormEntryFee("0");
      setFormReward("50");
      setFormRivalMode("auto");
      setFormDriverName("Phantom Rival");
      setFormTeamName("Midnight Syndicate");
      setFormRivalTitle("Challenger Boss");
      setFormSelectedCardIds([]);
      setFormRivalCrew([
        { cardId: "crew-27-one-more-time", tier: "gold" },
        { cardId: "crew-24-dual-gain-gyro", tier: "gold" },
        { cardId: "crew-28-vip-judge-box", tier: "gold" },
      ]);
    }
    setShowAdminModal(true);

    if (adminCandidateCards.length === 0) {
      setLoadingCandidates(true);
      try {
        const candRes = await listAdminChallengeCandidateCardsAction();
        if (candRes.success && candRes.data) {
          setAdminCandidateCards(candRes.data);
        }
      } catch (e) {
        console.error("Failed to load candidates:", e);
      } finally {
        setLoadingCandidates(false);
      }
    }
  };

  const handleSaveChallenge = () => {
    if (!formTitle.trim()) {
      alert("Please provide a challenge title.");
      return;
    }

    startTransition(async () => {
      const input: AdminChallengeInput = {
        id: editingChallenge?.id,
        title: formTitle.trim(),
        subtitle: formSubtitle.trim() || `${formRarity.toUpperCase()} Spec Challenge`,
        description: formDescription.trim(),
        badge: formBadge.trim() || `${formRarity.toUpperCase()} ONLY`,
        themeStyle: formTheme,
        allowedRarity: formRarity,
        maxTotalScore: formMaxScore.trim() ? Number(formMaxScore) : null,
        entryCostPCredits: Math.max(0, Number(formEntryFee) || 0),
        rewardPCredits: Math.max(0, Number(formReward) || 0),
        customRival:
          formRivalMode === "custom" && formSelectedCardIds.length === 3
            ? {
                driverName: formDriverName.trim() || "Phantom Rival",
                teamName: formTeamName.trim() || "Midnight Syndicate",
                title: formRivalTitle.trim() || "Challenger Boss",
                carCardIds: formSelectedCardIds,
                crewCards: formRivalCrew,
              }
            : null,
      };

      const res = await saveAdminChallengeAction(input);
      if (res.success) {
        setShowAdminModal(false);
        await loadChallenges();
      } else {
        alert(res.error || "Failed to save challenge.");
      }
    });
  };

  const handleDeleteChallenge = async (challengeId: string, isSystem = false) => {
    const msg = isSystem
      ? "Reset this built-in challenge back to factory default settings?"
      : "Are you sure you want to delete this custom challenge?";
    if (!confirm(msg)) return;
    const res = await deleteAdminChallengeAction(challengeId);
    if (res.success) {
      await loadChallenges();
    } else {
      alert(res.error || "Failed to update challenge.");
    }
  };

  // Filter candidate cards for custom rival
  const filteredCandidates = useMemo(() => {
    if (!candidateSearch.trim()) return adminCandidateCards;
    const q = candidateSearch.toLowerCase();
    return adminCandidateCards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.driver && c.driver.toLowerCase().includes(q)) ||
        (c.team && c.team.toLowerCase().includes(q)) ||
        c.tier.toLowerCase().includes(q)
    );
  }, [adminCandidateCards, candidateSearch]);

  return (
    <div className="space-y-6">
      {/* Challenges Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-5 sm:p-6 shadow-2xl">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-amber-300">
                <span>🏆</span> Tandem Clash Series
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                {completedIds.length} / {challenges.length} Won Today
              </span>
              <span className="rounded-full border border-purple-500/30 bg-purple-950/50 px-2.5 py-0.5 text-xs font-bold text-purple-300 tabular-nums">
                ⏳ Resets in {utcCountdown}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Tandem Clash Challenges &amp; Tournaments
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Compete under strict rarity specs and power caps. Face off against championship cup builds to win daily P-Credit rewards!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => openAdminCreateModal()}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>➕</span> Create Custom Challenge
              </button>
            )}
            <button
              type="button"
              onClick={loadChallenges}
              disabled={loading}
              className="rounded-2xl border border-zinc-700 bg-zinc-900/80 px-3.5 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              {loading ? "..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* Challenges List Grid */}
      {loading && challenges.length === 0 ? (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mb-3" />
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Scouting Challenger series and community leaderboards...
          </p>
        </div>
      ) : errorMsg ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-center text-rose-300 text-xs font-bold">
          {errorMsg}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => {
            const theme =
              CHALLENGE_THEME_CONFIGS[challenge.themeStyle] || CHALLENGE_THEME_CONFIGS.cyber;
            const isCompleted = completedIds.includes(challenge.id);

            // Compute how many user cards qualify for this challenge
            const qualifyingCars = userCards.filter(
              (c) => isCarEligibleForChallenge(c, challenge).eligible
            );
            const userCanAfford = pCredits >= challenge.entryCostPCredits;
            const hasEnoughCars = qualifyingCars.length >= 3;

            return (
              <div
                key={challenge.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-all duration-200 bg-gradient-to-br ${theme.bgGradientClass} ${theme.borderClass} ${theme.glowClass} shadow-xl`}
              >
                {/* Top Badge & Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${theme.badgeClass}`}
                    >
                      <span>{theme.icon}</span> {challenge.badge || challenge.title}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 tabular-nums">
                          ✓ Played Today · ⏳ {utcCountdown}
                        </span>
                      )}
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openAdminCreateModal(challenge)}
                            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-zinc-300 hover:text-white"
                          >
                            Edit
                          </button>
                          {challenge.isSystem ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteChallenge(challenge.id, true)}
                              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-zinc-400 hover:text-white"
                              title="Reset built-in cup to factory defaults"
                            >
                              ↺
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteChallenge(challenge.id, false)}
                              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
                              title="Delete custom challenge"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white">{challenge.title}</h3>
                    <p className={`text-xs font-bold ${theme.accentTextClass}`}>
                      {challenge.subtitle}
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed line-clamp-2">
                      {challenge.description}
                    </p>
                  </div>

                  {/* Restrictions & Rule Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-300">
                      Rarity:{" "}
                      <span className={theme.accentTextClass}>
                        {challenge.allowedRarity === "any"
                          ? "Open (Any Tier)"
                          : `${challenge.allowedRarity.toUpperCase()} Only`}
                      </span>
                    </span>

                    {challenge.maxTotalScore && (
                      <span className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-300">
                        Power Cap:{" "}
                        <span className="text-amber-300">Max {challenge.maxTotalScore} PTS</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Stats & Launch Button */}
                <div className="mt-5 space-y-3 border-t border-zinc-800/80 pt-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-zinc-500">
                        Entry Fee
                      </span>
                      <span className="font-black text-white">
                        {challenge.entryCostPCredits > 0
                          ? `🪙 ${challenge.entryCostPCredits} P-Credits`
                          : "Free Entry"}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase text-zinc-500">
                        Victory Reward
                      </span>
                      <span className="font-black text-emerald-400 text-sm">
                        ⚡ +{challenge.rewardPCredits} P-Credits
                      </span>
                    </div>
                  </div>

                  {/* Player qualification status */}
                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span
                      className={`font-bold ${
                        hasEnoughCars ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {qualifyingCars.length > 0
                        ? `🚗 ${qualifyingCars.length} ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : "eligible"} car(s) qualify`
                        : `⚠️ Need 3 ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : "eligible"} cars`}
                    </span>

                    {!userCanAfford && challenge.entryCostPCredits > 0 && (
                      <span className="text-rose-400 font-bold">
                        Need {challenge.entryCostPCredits - pCredits} more P-Credits
                      </span>
                    )}
                  </div>

                  {/* Enter Button */}
                  <button
                    type="button"
                    disabled={isCompleted || !userCanAfford || !hasEnoughCars}
                    onClick={() => onSelectChallenge(challenge)}
                    className={`min-h-11 w-full rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg transition-all ${
                      isCompleted
                        ? "border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 cursor-not-allowed opacity-90 shadow-none"
                        : !userCanAfford || !hasEnoughCars
                        ? "border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed opacity-50 shadow-none"
                        : `bg-gradient-to-r text-white ${theme.buttonClass} active:scale-[0.98]`
                    }`}
                  >
                    <span>
                      {isCompleted
                        ? `✓ Already Played Today (Resets in ${utcCountdown})`
                        : !hasEnoughCars
                        ? `🔒 Need 3 ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : "Eligible"} Cars (${qualifyingCars.length}/3 Available)`
                        : challenge.entryCostPCredits > 0
                        ? `⚡ Enter Cup (${challenge.entryCostPCredits}P)`
                        : "⚡ Enter Challenge"}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADMIN CHALLENGE CREATOR / EDITOR MODAL ───────────────────────── */}
      {showAdminModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 text-white shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
                  Track Admin Console
                </span>
                <h3 className="text-lg font-black text-white">
                  {editingChallenge ? "Edit Challenge Cup" : "Create New Tandem Cup"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-400 mb-1">
                    Challenge Title *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Midnight Wangan Cup"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-400 mb-1">
                    Subtitle
                  </label>
                  <input
                    type="text"
                    value={formSubtitle}
                    onChange={(e) => setFormSubtitle(e.target.value)}
                    placeholder="e.g. Gold Tier Only · High RPM Battle"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-zinc-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the lore and challenge constraints for drivers..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-400 mb-1">
                    Card Badge Text
                  </label>
                  <input
                    type="text"
                    value={formBadge}
                    onChange={(e) => setFormBadge(e.target.value)}
                    placeholder="e.g. GOLD ONLY · MAX 80 PTS"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-400 mb-1">
                    Theme Visual Style
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        "bronze",
                        "silver",
                        "gold",
                        "legend",
                        "cyber",
                        "touge",
                        "neon",
                        "fire",
                      ] as ChallengeThemeStyle[]
                    ).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormTheme(t)}
                        className={`rounded-lg border py-1 text-[10px] font-black uppercase transition-all ${
                          formTheme === t
                            ? "border-white bg-white/20 text-white shadow-sm"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        {CHALLENGE_THEME_CONFIGS[t].icon} {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Restrictions */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
                <span className="block text-[11px] font-black uppercase text-amber-400">
                  Challenge Restrictions
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Required Car Rarity
                    </label>
                    <select
                      value={formRarity}
                      onChange={(e) => setFormRarity(e.target.value as ChallengeRarityFilter)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="any">Open (Any Rarity Allowed)</option>
                      <option value="bronze">Bronze Only</option>
                      <option value="silver">Silver Only</option>
                      <option value="gold">Gold Only</option>
                      <option value="legend">Legend Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Max Total Score (out of 100)
                    </label>
                    <input
                      type="number"
                      disabled={Boolean(editingChallenge?.isSystem)}
                      value={editingChallenge?.isSystem ? "" : formMaxScore}
                      onChange={(e) => setFormMaxScore(e.target.value)}
                      placeholder={
                        editingChallenge?.isSystem
                          ? "Unlimited (All cards of tier allowed)"
                          : "Leave blank for unlimited"
                      }
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {editingChallenge?.isSystem && (
                      <span className="text-[9px] text-zinc-500 block mt-1">
                        Built-in cups allow all cars matching the rarity tier.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Economy */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
                <span className="block text-[11px] font-black uppercase text-emerald-400">
                  P-Credits Economy
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Entry Cost (P-Credits)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formEntryFee}
                      onChange={(e) => setFormEntryFee(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Victory Reward (P-Credits)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formReward}
                      onChange={(e) => setFormReward(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Rival Selection Mode */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="block text-[11px] font-black uppercase text-cyan-400">
                    Rival Team Generation
                  </span>
                  <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                    <button
                      type="button"
                      onClick={() => setFormRivalMode("auto")}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition-all ${
                        formRivalMode === "auto"
                          ? "bg-cyan-500 text-black shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Dynamic Community Best
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRivalMode("custom")}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition-all ${
                        formRivalMode === "custom"
                          ? "bg-cyan-500 text-black shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Hand-Pick 3 Cars
                    </button>
                  </div>
                </div>

                {formRivalMode === "custom" ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-zinc-500 mb-1">
                          Driver Name
                        </label>
                        <input
                          type="text"
                          value={formDriverName}
                          onChange={(e) => setFormDriverName(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-zinc-500 mb-1">
                          Team Name
                        </label>
                        <input
                          type="text"
                          value={formTeamName}
                          onChange={(e) => setFormTeamName(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-zinc-500 mb-1">
                          Rival Title
                        </label>
                        <input
                          type="text"
                          value={formRivalTitle}
                          onChange={(e) => setFormRivalTitle(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white"
                        />
                      </div>
                    </div>

                    {/* Selected 3 Rival Cars */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-zinc-400">
                          Selected Rival Cars ({formSelectedCardIds.length} / 3)
                        </span>
                        {formSelectedCardIds.length === 3 && (
                          <span className="text-emerald-400 font-bold text-[10px]">✓ Ready</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((slotIdx) => {
                          const cardId = formSelectedCardIds[slotIdx];
                          const cardInfo = adminCandidateCards.find((c) => c.id === cardId);
                          return (
                            <div
                              key={slotIdx}
                              className="rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-center"
                            >
                              <span className="block text-[9px] font-bold uppercase text-zinc-500">
                                Car #{slotIdx + 1}
                              </span>
                              {cardInfo ? (
                                <div className="mt-1">
                                  <span className="block truncate font-black text-white text-[11px]">
                                    {cardInfo.name}
                                  </span>
                                  <span className="block text-[10px] text-amber-400">
                                    {cardInfo.tier.toUpperCase()} · {cardInfo.totalScore} PTS
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormSelectedCardIds((prev) =>
                                        prev.filter((id) => id !== cardId)
                                      )
                                    }
                                    className="mt-1 text-[9px] text-rose-400 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <span className="block py-2 text-[10px] italic text-zinc-600">
                                  Empty
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card Browser for selection */}
                    <div className="space-y-1.5 pt-2">
                      <input
                        type="text"
                        placeholder="Search member & set cards to add..."
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
                        {loadingCandidates ? (
                          <p className="p-2 text-center text-zinc-500">Loading cards...</p>
                        ) : filteredCandidates.slice(0, 50).map((cand) => {
                          const isSelected = formSelectedCardIds.includes(cand.id);
                          return (
                            <div
                              key={cand.id}
                              className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-zinc-900"
                            >
                              <div>
                                <span className="font-bold text-white text-[11px]">{cand.name}</span>
                                <span className="ml-2 text-[10px] text-zinc-400">
                                  {cand.tier} · {cand.totalScore} PTS {cand.isSetCard && "· Set"}
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={isSelected || formSelectedCardIds.length >= 3}
                                onClick={() =>
                                  setFormSelectedCardIds((prev) => [...prev, cand.id])
                                }
                                className="rounded px-2 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-200 hover:bg-purple-600 hover:text-white disabled:opacity-30"
                              >
                                {isSelected ? "Selected" : "+ Add"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Rival Crew Advantages & Rarity Selection */}
                    <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-cyan-400">
                          ⚡ Rival Crew Advantage Cards &amp; Rarity (3 Cards)
                        </span>
                        <span className="text-[9px] text-zinc-500">
                          Choose 3 advantages &amp; their pull rarity tier
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[0, 1, 2].map((slotIdx) => {
                          const crewEntry = formRivalCrew[slotIdx] || {
                            cardId: CREW_CARD_SET[0].id,
                            tier: "gold" as FullArtTier,
                          };
                          return (
                            <div
                              key={slotIdx}
                              className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 space-y-1.5"
                            >
                              <span className="block text-[9px] font-bold uppercase text-zinc-500">
                                Crew #{slotIdx + 1}
                              </span>
                              <select
                                value={crewEntry.cardId}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  setFormRivalCrew((prev) => {
                                    const copy = [...prev];
                                    copy[slotIdx] = { ...copy[slotIdx], cardId: nextId };
                                    return copy;
                                  });
                                }}
                                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none truncate"
                              >
                                {CREW_CARD_SET.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                  </option>
                                ))}
                              </select>
                              <div>
                                <label className="block text-[8px] font-bold uppercase text-zinc-500 mb-0.5">
                                  Rarity Tier
                                </label>
                                <select
                                  value={crewEntry.tier}
                                  onChange={(e) => {
                                    const nextTier = e.target.value as FullArtTier;
                                    setFormRivalCrew((prev) => {
                                      const copy = [...prev];
                                      copy[slotIdx] = { ...copy[slotIdx], tier: nextTier };
                                      return copy;
                                    });
                                  }}
                                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-black uppercase text-amber-300 focus:border-cyan-500 focus:outline-none"
                                >
                                  <option value="bronze">🥉 Bronze Tier</option>
                                  <option value="silver">🥈 Silver Tier</option>
                                  <option value="gold">🥇 Gold Tier</option>
                                  <option value="legend">👑 Legend Tier</option>
                                  <option value="mythic">🌌 Mythic Tier</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    The rival team will be dynamically assembled from the highest rated qualifying
                    cars submitted by community members in the active card pool.
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveChallenge}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Challenge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

