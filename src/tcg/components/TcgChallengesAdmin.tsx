"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import type { FullArtTier } from "@/lib/full-art-card";
import { CREW_CARD_SET } from "@/lib/crew-cards";
import {
  CHALLENGE_THEME_CONFIGS,
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

export function TcgChallengesAdmin({
  initialChallenges = [],
  initialCandidateCards = [],
}: {
  initialChallenges?: TandemClashChallenge[];
  initialCandidateCards?: Array<{
    id: string;
    name: string;
    driver?: string;
    team?: string;
    tier: string;
    totalScore: number;
    isSetCard?: boolean;
  }>;
}) {
  const [challenges, setChallenges] = useState<TandemClashChallenge[]>(initialChallenges);
  const [candidateCards, setCandidateCards] = useState(initialCandidateCards);
  const [loading, setLoading] = useState(initialChallenges.length === 0);
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "system" | "custom">("all");

  // Creator / Editor Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<TandemClashChallenge | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");

  // Form inputs
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

  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    setLoading(true);
    try {
      const [chRes, candRes] = await Promise.all([
        listTandemClashChallengesAction(),
        listAdminChallengeCandidateCardsAction(),
      ]);
      if (chRes.success && chRes.data) {
        setChallenges(chRes.data.challenges);
      }
      if (candRes.success && candRes.data) {
        setCandidateCards(candRes.data);
      }
    } catch (err) {
      console.error("loadData error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialChallenges.length === 0) {
      loadData();
    }
  }, []);

  const openModal = (ch?: TandemClashChallenge) => {
    if (ch) {
      setEditingChallenge(ch);
      setFormTitle(ch.title);
      setFormSubtitle(ch.subtitle);
      setFormDescription(ch.description);
      setFormBadge(ch.badge);
      setFormTheme(ch.themeStyle);
      setFormRarity(ch.allowedRarity);
      setFormMaxScore(ch.maxTotalScore ? String(ch.maxTotalScore) : "");
      setFormEntryFee(String(ch.entryCostPCredits || 0));
      setFormReward(String(ch.rewardPCredits || 0));
      if (ch.customRival) {
        setFormRivalMode("custom");
        setFormDriverName(ch.customRival.driverName || "Phantom Rival");
        setFormTeamName(ch.customRival.teamName || "Midnight Syndicate");
        setFormRivalTitle(ch.customRival.title || "Challenger Boss");
        setFormSelectedCardIds(ch.customRival.carCardIds || []);
        if (ch.customRival.crewCards && ch.customRival.crewCards.length === 3) {
          setFormRivalCrew(ch.customRival.crewCards);
        } else {
          const defaultTier: FullArtTier = (ch.allowedRarity !== "any"
            ? ch.allowedRarity
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
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formTitle.trim()) {
      alert("Please enter a title for the challenge.");
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
        setShowModal(false);
        await loadData();
      } else {
        alert(res.error || "Failed to save challenge.");
      }
    });
  };

  const handleDelete = async (id: string, isSystem = false) => {
    const msg = isSystem
      ? "Reset this built-in challenge back to factory default settings?"
      : "Are you sure you want to delete this custom challenge?";
    if (!confirm(msg)) return;
    const res = await deleteAdminChallengeAction(id);
    if (res.success) {
      await loadData();
    } else {
      alert(res.error || "Failed to update challenge.");
    }
  };

  // Candidate cards search filter
  const filteredCandidates = useMemo(() => {
    if (!candidateSearch.trim()) return candidateCards;
    const q = candidateSearch.toLowerCase();
    return candidateCards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.driver && c.driver.toLowerCase().includes(q)) ||
        (c.team && c.team.toLowerCase().includes(q)) ||
        c.tier.toLowerCase().includes(q)
    );
  }, [candidateCards, candidateSearch]);

  // Display challenges filter
  const displayedChallenges = useMemo(() => {
    return challenges.filter((c) => {
      if (filterType === "system" && !c.isSystem) return false;
      if (filterType === "custom" && c.isSystem) return false;
      if (filterRarity !== "all" && c.allowedRarity !== filterRarity) return false;
      return true;
    });
  }, [challenges, filterType, filterRarity]);

  return (
    <div className="space-y-6">
      {/* Top Stats Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <span className="block text-[10px] font-black uppercase text-zinc-500">
            Total Challenges
          </span>
          <span className="text-2xl font-black text-zinc-900 dark:text-white">
            {challenges.length}
          </span>
          <span className="block text-[11px] text-zinc-500 mt-0.5">
            {challenges.filter((c) => c.isSystem).length} System · {challenges.filter((c) => !c.isSystem).length} Custom
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <span className="block text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
            Rarity Specs
          </span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
            4 Tiers
          </span>
          <span className="block text-[11px] text-zinc-500 mt-0.5">
            Bronze, Silver, Gold, Legend
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <span className="block text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
            Total Victory Purse
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            ⚡ {challenges.reduce((sum, c) => sum + (c.rewardPCredits || 0), 0)} P
          </span>
          <span className="block text-[11px] text-zinc-500 mt-0.5">
            P-Credits awarded on victory
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm flex flex-col justify-center">
          <button
            type="button"
            onClick={() => openModal()}
            className="w-full rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 py-2.5 px-3 text-xs font-black uppercase tracking-wider text-white shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            ➕ Create Challenge
          </button>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-zinc-500 mr-1 uppercase">Filter:</span>
          {(["all", "system", "custom"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase transition-all ${
                filterType === t
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {t === "all" ? "All Series" : t === "system" ? "Built-in System" : "Admin Custom"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterRarity}
            onChange={(e) => setFilterRarity(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="all">All Rarities</option>
            <option value="any">Open Rarity</option>
            <option value="bronze">Bronze Only</option>
            <option value="silver">Silver Only</option>
            <option value="gold">Gold Only</option>
            <option value="legend">Legend Only</option>
          </select>

          <Link
            href="/cards?tab=clash"
            className="rounded-xl border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
          >
            🎮 Test in Arena →
          </Link>
        </div>
      </div>

      {/* Challenge Cards Grid */}
      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mb-3" />
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Loading challenge database...
          </p>
        </div>
      ) : displayedChallenges.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-bold text-zinc-500">No challenges match this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedChallenges.map((ch) => {
            const theme = CHALLENGE_THEME_CONFIGS[ch.themeStyle] || CHALLENGE_THEME_CONFIGS.cyber;
            return (
              <div
                key={ch.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 shadow-lg bg-gradient-to-br ${theme.bgGradientClass} ${theme.borderClass}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${theme.badgeClass}`}
                    >
                      <span>{theme.icon}</span> {ch.badge || ch.title}
                    </span>

                    <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                      {ch.isSystem ? "Built-in" : "Custom"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-white">{ch.title}</h3>
                    <p className={`text-xs font-bold ${theme.accentTextClass}`}>
                      {ch.subtitle}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{ch.description}</p>
                  </div>

                  {/* Restrictions & Rule Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                    <span className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 font-black uppercase text-zinc-300">
                      Rarity:{" "}
                      <span className={theme.accentTextClass}>
                        {ch.allowedRarity === "any"
                          ? "Open"
                          : `${ch.allowedRarity.toUpperCase()} Only`}
                      </span>
                    </span>

                    {ch.maxTotalScore && (
                      <span className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 font-black uppercase text-amber-300">
                        Max {ch.maxTotalScore} PTS
                      </span>
                    )}

                    <span className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 font-black uppercase text-zinc-300">
                      Rival:{" "}
                      <span className="text-zinc-200">
                        {ch.customRival ? ch.customRival.title : "Community Elite"}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-zinc-800/80 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-zinc-500">
                        Entry Fee
                      </span>
                      <span className="font-black text-white">
                        {ch.entryCostPCredits > 0 ? `🪙 ${ch.entryCostPCredits} P` : "Free"}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="block text-[9px] font-bold uppercase text-zinc-500">
                        Victory Reward
                      </span>
                      <span className="font-black text-emerald-400 text-sm">
                        ⚡ +{ch.rewardPCredits} P
                      </span>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openModal(ch)}
                      className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/80 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                    >
                      ✏️ Edit
                    </button>
                    {ch.isSystem ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(ch.id, true)}
                        className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800"
                        title="Reset built-in cup to factory defaults"
                      >
                        ↺ Reset
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(ch.id, false)}
                        className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────────────── */}
      {showModal && (
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
                  {editingChallenge ? "Edit Challenge Cup" : "Create New Challenge Cup"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

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
                          const cardInfo = candidateCards.find((c) => c.id === cardId);
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

                    {/* Search & pick candidate cards */}
                    <div className="space-y-1.5 pt-2">
                      <input
                        type="text"
                        placeholder="Search member & set cards to add to rival crew..."
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
                        {filteredCandidates.slice(0, 50).map((cand) => {
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
                                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none capitalize"
                                >
                                  <option value="bronze">Bronze</option>
                                  <option value="silver">Silver</option>
                                  <option value="gold">Gold</option>
                                  <option value="legend">Legend</option>
                                  <option value="mythic">Mythic</option>
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
                    The rival team will be automatically assembled from the highest rated qualifying
                    cars submitted by community members matching the challenge requirements.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
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

