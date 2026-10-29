"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import ImageUploader from "@/components/ui/ImageUploader";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { FULL_ART_TIERS, type FullArtTier } from "@/lib/full-art-card";
import { rarityLabel } from "@/lib/card-roll";
import {
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  debuffDefinitionToCardData,
  trackDefinitionToCardData,
  type CrewCardDefinition,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";
import {
  saveClashGameCardsConfigAction,
  listClashEarlyAccessRosterAction,
  grantClashEarlyAccessAction,
  revokeClashEarlyAccessAction,
  type EarlyAccessMemberItem,
} from "@/tcg/actions";
import type { ClashGameCardsConfig } from "@/tcg/storage";

type SubTab = "crew" | "debuff" | "track" | "early_access";

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const panelClass =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export function TcgClashCardsAdmin({
  initialConfig,
}: {
  initialConfig: ClashGameCardsConfig;
}) {
  const [subTab, setSubTab] = useState<SubTab>("crew");
  const [crewCards, setCrewCards] = useState<CrewCardDefinition[]>(
    () => initialConfig.crewCards ?? CREW_CARD_SET
  );
  const [debuffCards, setDebuffCards] = useState<DebuffCardDefinition[]>(
    () => initialConfig.debuffCards ?? DEBUFF_CARD_SET
  );
  const [trackCards, setTrackCards] = useState<TrackCardDefinition[]>(
    () => initialConfig.trackCards ?? UK_TRACK_CARD_SET
  );

  const [editingCrew, setEditingCrew] = useState<CrewCardDefinition | null>(
    () => (initialConfig.crewCards ?? CREW_CARD_SET)[0] ?? null
  );
  const [editingDebuff, setEditingDebuff] = useState<DebuffCardDefinition | null>(
    () => (initialConfig.debuffCards ?? DEBUFF_CARD_SET)[0] ?? null
  );
  const [editingTrack, setEditingTrack] = useState<TrackCardDefinition | null>(
    () => (initialConfig.trackCards ?? UK_TRACK_CARD_SET)[0] ?? null
  );

  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // Early Access Beta Roster State
  const [roster, setRoster] = useState<EarlyAccessMemberItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState<boolean>(false);
  const [rosterSearch, setRosterSearch] = useState<string>("");
  const [rosterFilter, setRosterFilter] = useState<"all" | "granted" | "locked">("all");
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  async function loadRoster() {
    setLoadingRoster(true);
    try {
      const res = await listClashEarlyAccessRosterAction();
      if (res.success) {
        setRoster(res.data);
      } else {
        setStatusMsg({ text: res.error, error: true });
      }
    } catch {
      setStatusMsg({ text: "Failed to load member roster.", error: true });
    } finally {
      setLoadingRoster(false);
    }
  }

  useEffect(() => {
    if (subTab === "early_access" && roster.length === 0) {
      loadRoster();
    }
  }, [subTab, roster.length]);

  async function handleToggleEarlyAccess(member: EarlyAccessMemberItem) {
    if (member.role === "admin") return;
    setTogglingUserId(member.id);
    const newStatus = !member.hasEarlyAccess;
    // Optimistic UI update
    setRoster((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: newStatus } : m))
    );
    try {
      const res = newStatus
        ? await grantClashEarlyAccessAction(member.id)
        : await revokeClashEarlyAccessAction(member.id);
      if (res.success) {
        setStatusMsg({
          text: newStatus
            ? `Granted Tandem Clash Early Access to ${member.name}`
            : `Revoked Tandem Clash Early Access for ${member.name}`,
        });
      } else {
        // Revert on failure
        setRoster((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
        );
        setStatusMsg({ text: res.error, error: true });
      }
    } catch {
      setRoster((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
      );
      setStatusMsg({ text: "Failed to update member permission.", error: true });
    } finally {
      setTogglingUserId(null);
    }
  }

  function persistAll(next: {
    crew?: CrewCardDefinition[];
    debuff?: DebuffCardDefinition[];
    track?: TrackCardDefinition[];
    successLabel: string;
  }) {
    const nextCrew = next.crew ?? crewCards;
    const nextDebuff = next.debuff ?? debuffCards;
    const nextTrack = next.track ?? trackCards;
    setStatusMsg(null);
    startTransition(async () => {
      const res = await saveClashGameCardsConfigAction({
        crewCards: nextCrew,
        debuffCards: nextDebuff,
        trackCards: nextTrack,
      });
      if (res.success) {
        setCrewCards(res.data.crewCards);
        setDebuffCards(res.data.debuffCards);
        setTrackCards(res.data.trackCards);
        setStatusMsg({ text: next.successLabel });
      } else {
        setStatusMsg({ text: res.error, error: true });
      }
    });
  }

  // ── Crew Card Actions ────────────────────────────────────────────────────
  function handleCreateBespokeCrew() {
    const nextNum = crewCards.length + 1;
    const newCard: CrewCardDefinition = {
      id: `crew-custom-${Date.now()}`,
      setNumber: nextNum,
      name: `Bespoke Crew #${nextNum}`,
      category: "Pit Crew Tuning",
      ability: "CUSTOM ADVANTAGE · +2 DRIFT & +2 PTS",
      effect: "Custom Pit Crew advantage card created by admin! Grants +2 DRIFT and +2 pts on the corner it is played.",
      tier: "gold",
      icon: "⚡",
      accentColor: "#06b6d4",
      pullWeight: 18,
      modifiers: { driftBonus: 2, flatBonus: 2 },
      isCustom: true,
    };
    setEditingCrew(newCard);
    setStatusMsg(null);
  }

  function handleSaveCrewCard() {
    if (!editingCrew) return;
    if (!editingCrew.name.trim()) {
      setStatusMsg({ text: "Give the Crew Card a name first.", error: true });
      return;
    }
    const exists = crewCards.some((c) => c.id === editingCrew.id);
    const updated = exists
      ? crewCards.map((c) => (c.id === editingCrew.id ? editingCrew : c))
      : [...crewCards, editingCrew];
    persistAll({
      crew: updated,
      successLabel: `Saved Crew Advantage Card "${editingCrew.name}"`,
    });
  }

  function handleDeleteOrResetCrew(target: CrewCardDefinition) {
    const builtIn = CREW_CARD_SET.find((c) => c.id === target.id);
    if (builtIn) {
      const updated = crewCards.map((c) => (c.id === target.id ? builtIn : c));
      setEditingCrew(builtIn);
      persistAll({
        crew: updated,
        successLabel: `Reset "${builtIn.name}" to default Crew Card settings`,
      });
    } else {
      const updated = crewCards.filter((c) => c.id !== target.id);
      setEditingCrew(updated[0] ?? null);
      persistAll({
        crew: updated,
        successLabel: `Deleted bespoke Crew Card "${target.name}"`,
      });
    }
  }

  // ── Debuff Card Actions ──────────────────────────────────────────────────
  function handleCreateBespokeDebuff() {
    const nextNum = debuffCards.length + 1;
    const newCard: DebuffCardDefinition = {
      id: `debuff-custom-${Date.now()}`,
      setNumber: nextNum,
      name: `Bespoke Hazard #${nextNum}`,
      category: "Track Hazard",
      ability: "HAZARD · BOTH -1 STEER & -2 PTS",
      effect: "Custom Corner Debuff card! Applies -1 STEER and -2 pts to both drivers on this corner.",
      tier: "silver",
      icon: "⚠️",
      accentColor: "#f43f5e",
      penalties: { steerPenalty: 1, flatPenalty: 2 },
      isCustom: true,
    };
    setEditingDebuff(newCard);
    setStatusMsg(null);
  }

  function handleSaveDebuffCard() {
    if (!editingDebuff) return;
    if (!editingDebuff.name.trim()) {
      setStatusMsg({ text: "Give the Debuff Card a name first.", error: true });
      return;
    }
    const exists = debuffCards.some((c) => c.id === editingDebuff.id);
    const updated = exists
      ? debuffCards.map((c) => (c.id === editingDebuff.id ? editingDebuff : c))
      : [...debuffCards, editingDebuff];
    persistAll({
      debuff: updated,
      successLabel: `Saved Corner Debuff Card "${editingDebuff.name}"`,
    });
  }

  function handleDeleteOrResetDebuff(target: DebuffCardDefinition) {
    const builtIn = DEBUFF_CARD_SET.find((c) => c.id === target.id);
    if (builtIn) {
      const updated = debuffCards.map((c) => (c.id === target.id ? builtIn : c));
      setEditingDebuff(builtIn);
      persistAll({
        debuff: updated,
        successLabel: `Reset "${builtIn.name}" to default Debuff settings`,
      });
    } else {
      const updated = debuffCards.filter((c) => c.id !== target.id);
      setEditingDebuff(updated[0] ?? null);
      persistAll({
        debuff: updated,
        successLabel: `Deleted bespoke Debuff Card "${target.name}"`,
      });
    }
  }

  // ── UK Track Card Actions ────────────────────────────────────────────────
  function handleCreateBespokeTrack() {
    const nextNum = trackCards.length + 1;
    const newCard: TrackCardDefinition = {
      id: `track-custom-${Date.now()}`,
      setNumber: nextNum,
      name: `UK Drift Track #${nextNum}`,
      region: "UK · Technical Drift Venue",
      ability: "UK VENUE · TECHNICAL DRIFT CIRCUIT",
      effect: "Custom UK RC Drift venue! All tracks are Gold cards with Buffs & Hazards dynamically randomised on match load.",
      buffLabel: "Randomised on match spin",
      debuffLabel: "Randomised on match spin",
      tier: "gold",
      icon: "🇬🇧",
      accentColor: "#f59e0b",
      rules: {},
      isCustom: true,
    };
    setEditingTrack(newCard);
    setStatusMsg(null);
  }

  function handleSaveTrackCard() {
    if (!editingTrack) return;
    if (!editingTrack.name.trim()) {
      setStatusMsg({ text: "Give the UK Track Card a name first.", error: true });
      return;
    }
    const trackWithGoldTier: TrackCardDefinition = {
      ...editingTrack,
      tier: "gold",
    };
    const exists = trackCards.some((c) => c.id === trackWithGoldTier.id);
    const updated = exists
      ? trackCards.map((c) => (c.id === trackWithGoldTier.id ? trackWithGoldTier : c))
      : [...trackCards, trackWithGoldTier];
    persistAll({
      track: updated,
      successLabel: `Saved UK Track Card "${trackWithGoldTier.name}"`,
    });
  }

  function handleDeleteOrResetTrack(target: TrackCardDefinition) {
    const builtIn = UK_TRACK_CARD_SET.find((c) => c.id === target.id);
    if (builtIn) {
      const updated = trackCards.map((c) => (c.id === target.id ? builtIn : c));
      setEditingTrack(builtIn);
      persistAll({
        track: updated,
        successLabel: `Reset "${builtIn.name}" to default UK Track settings`,
      });
    } else {
      const updated = trackCards.filter((c) => c.id !== target.id);
      setEditingTrack(updated[0] ?? null);
      persistAll({
        track: updated,
        successLabel: `Deleted bespoke UK Track Card "${target.name}"`,
      });
    }
  }

  const previewCardData = useMemo(() => {
    if (subTab === "crew" && editingCrew) {
      return { id: editingCrew.id, ...crewDefinitionToCardData(editingCrew) };
    }
    if (subTab === "debuff" && editingDebuff) {
      return debuffDefinitionToCardData(editingDebuff);
    }
    if (subTab === "track" && editingTrack) {
      return trackDefinitionToCardData(editingTrack);
    }
    return null;
  }, [subTab, editingCrew, editingDebuff, editingTrack]);

  const filteredRoster = useMemo(() => {
    let list = roster;
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase();
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q) ||
          (m.id || "").toLowerCase().includes(q)
      );
    }
    if (rosterFilter === "granted") {
      list = list.filter((m) => m.hasEarlyAccess);
    } else if (rosterFilter === "locked") {
      list = list.filter((m) => !m.hasEarlyAccess && m.role !== "admin");
    }
    return list;
  }, [roster, rosterSearch, rosterFilter]);

  const totalRosterCount = roster.length;
  const grantedCount = roster.filter((m) => m.hasEarlyAccess).length;
  const lockedCount = Math.max(0, totalRosterCount - grantedCount);

  return (
    <div className="space-y-6">
      {/* Sub-Tab Selector Header */}
      <div className={`${panelClass} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-500">
              Tandem Clash Card Engine · Admin Manager
            </span>
            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
              {subTab === "early_access"
                ? "🔒 Tandem Clash · Early Access Player Management"
                : "Manage Crew Advantages, Corner Debuffs & UK Track Cards"}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {subTab === "early_access"
                ? "Grant or revoke Early Access beta clearance for drivers. Admins have permanent bypass access to test and play."
                : "Edit any built-in card, upload custom card artwork/photos, adjust buffs & debuffs, or create new bespoke cards for Tandem Clash and Standard Packs."}
            </p>
          </div>
          <div>
            {subTab === "crew" && (
              <button
                type="button"
                onClick={handleCreateBespokeCrew}
                className="min-h-11 rounded-xl bg-cyan-500 px-4 text-xs font-black uppercase tracking-wider text-black shadow-sm hover:bg-cyan-400"
              >
                + New Bespoke Crew Card
              </button>
            )}
            {subTab === "debuff" && (
              <button
                type="button"
                onClick={handleCreateBespokeDebuff}
                className="min-h-11 rounded-xl bg-rose-500 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-rose-400"
              >
                + New Bespoke Debuff Card
              </button>
            )}
            {subTab === "track" && (
              <button
                type="button"
                onClick={handleCreateBespokeTrack}
                className="min-h-11 rounded-xl bg-amber-500 px-4 text-xs font-black uppercase tracking-wider text-black shadow-sm hover:bg-amber-400"
              >
                + New Bespoke UK Track Card
              </button>
            )}
            {subTab === "early_access" && (
              <button
                type="button"
                onClick={loadRoster}
                disabled={loadingRoster}
                className="min-h-11 rounded-xl bg-purple-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-purple-500 disabled:opacity-50"
              >
                {loadingRoster ? "Refreshing..." : "↻ Refresh Roster"}
              </button>
            )}
          </div>
        </div>

        {/* 4 Category Pills */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setSubTab("crew")}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
              subTab === "crew"
                ? "border-cyan-500 bg-cyan-500/10 text-zinc-900 dark:text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            }`}
          >
            <div>
              <span className="block text-sm font-black">⚡ Crew Cards</span>
              <span className="text-[11px] opacity-80">
                100% Buffs · Pullable
              </span>
            </div>
            <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-black text-cyan-600 dark:text-cyan-300">
              {crewCards.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("debuff")}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
              subTab === "debuff"
                ? "border-rose-500 bg-rose-500/10 text-zinc-900 dark:text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            }`}
          >
            <div>
              <span className="block text-sm font-black">⚠️ Debuff Cards</span>
              <span className="text-[11px] opacity-80">
                Random Hazards
              </span>
            </div>
            <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-black text-rose-600 dark:text-rose-300">
              {debuffCards.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("track")}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
              subTab === "track"
                ? "border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            }`}
          >
            <div>
              <span className="block text-sm font-black">🇬🇧 UK Tracks</span>
              <span className="text-[11px] opacity-80">
                Venues &amp; Weather
              </span>
            </div>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-black text-amber-600 dark:text-amber-300">
              {trackCards.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab("early_access");
              if (roster.length === 0) loadRoster();
            }}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
              subTab === "early_access"
                ? "border-purple-500 bg-purple-500/10 text-zinc-900 dark:text-white"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            }`}
          >
            <div>
              <span className="block text-sm font-black">🔒 Early Access Beta</span>
              <span className="text-[11px] opacity-80">
                Driver Permissions
              </span>
            </div>
            <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-black text-purple-600 dark:text-purple-300">
              {grantedCount}
            </span>
          </button>
        </div>

        {statusMsg && (
          <p
            role={statusMsg.error ? "alert" : "status"}
            className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
              statusMsg.error
                ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {statusMsg.text}
          </p>
        )}
      </div>

      {/* Main Editor + Card Grid Split OR Early Access Beta Manager */}
      {subTab === "early_access" ? (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`${panelClass} flex items-center justify-between`}>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Registered Drivers
                </span>
                <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                  {totalRosterCount}
                </p>
              </div>
              <span className="rounded-2xl bg-zinc-100 p-3 text-2xl dark:bg-zinc-800">
                🏎️
              </span>
            </div>

            <div className={`${panelClass} flex items-center justify-between border-emerald-500/30 bg-emerald-500/5`}>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-500">
                  Early Access Granted
                </span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {grantedCount}
                </p>
              </div>
              <span className="rounded-2xl bg-emerald-500/20 p-3 text-2xl">
                ⚡
              </span>
            </div>

            <div className={`${panelClass} flex items-center justify-between border-zinc-300 dark:border-zinc-800`}>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Locked Out (No Access)
                </span>
                <p className="text-2xl font-black text-zinc-500 dark:text-zinc-400">
                  {lockedCount}
                </p>
              </div>
              <span className="rounded-2xl bg-zinc-100 p-3 text-2xl dark:bg-zinc-800">
                🔒
              </span>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className={`${panelClass} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Search drivers by name, email, or user ID..."
                  className={inputClass}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRosterFilter("all")}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                    rosterFilter === "all"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  All Drivers ({totalRosterCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilter("granted")}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                    rosterFilter === "granted"
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Granted ({grantedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilter("locked")}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                    rosterFilter === "locked"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Locked ({lockedCount})
                </button>
              </div>
            </div>

            {/* Drivers List */}
            {loadingRoster ? (
              <div className="py-16 text-center text-xs font-bold text-zinc-400">
                <div className="mb-2 text-2xl animate-spin">⚙️</div>
                Loading registered drivers roster...
              </div>
            ) : filteredRoster.length === 0 ? (
              <div className="py-16 text-center text-xs font-bold text-zinc-400">
                No drivers match the current filter or search query.
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredRoster.map((m) => {
                  const isAdminUser = m.role === "admin";
                  const isToggling = togglingUserId === m.id;
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5 transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 px-2 rounded-xl"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-sm text-zinc-900 dark:text-zinc-100">
                            {m.name || "Unnamed Driver"}
                          </span>
                          {isAdminUser ? (
                            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-amber-500">
                              👑 Track Admin
                            </span>
                          ) : (
                            <span className="rounded-full bg-zinc-500/10 border border-zinc-700/30 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-400">
                              🏎️ Driver
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              m.hasEarlyAccess
                                ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                            }`}
                          >
                            {isAdminUser
                              ? "Permanent Access"
                              : m.hasEarlyAccess
                              ? "Early Access Active ✓"
                              : "Locked 🔒"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>{m.email}</span>
                          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                            ID: {m.id}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAdminUser ? (
                          <span className="text-xs font-bold text-zinc-400 italic">
                            Admins bypass all gates
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isToggling}
                            onClick={() => handleToggleEarlyAccess(m)}
                            className={`min-h-10 rounded-xl px-4 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                              m.hasEarlyAccess
                                ? "border border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                                : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:opacity-90 shadow-sm"
                            }`}
                          >
                            {isToggling
                              ? "Updating..."
                              : m.hasEarlyAccess
                              ? "✕ Revoke Early Access"
                              : "⚡ Grant Early Access"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Main Editor + Card Grid Split */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
        {/* Left Sticky Live Card Preview */}
        <div className="space-y-4 lg:sticky lg:top-4">
          {previewCardData && (
            <div className={`${panelClass} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Live Card Preview
                </span>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
                  {rarityLabel(previewCardData.tier)}
                </span>
              </div>
              <div className="mx-auto w-full max-w-[280px]">
                <FullArtCard card={previewCardData} className="drop-shadow-xl" />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Active Card Editor Form + Full Set Grid */}
        <div className="space-y-6">
          {/* 1. CREW CARD EDITOR */}
          {subTab === "crew" && editingCrew && (
            <section className={`${panelClass} space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-500">
                    Editing Crew Advantage Card #{String(editingCrew.setNumber).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                    {editingCrew.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteOrResetCrew(editingCrew)}
                    disabled={pending}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {CREW_CARD_SET.some((c) => c.id === editingCrew.id)
                      ? "↺ Reset to Default"
                      : "🗑️ Delete Card"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCrewCard}
                    disabled={pending}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-black shadow-sm hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {pending ? "Saving…" : "💾 Save Crew Card"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Card Name</label>
                  <input
                    className={inputClass}
                    value={editingCrew.name}
                    maxLength={40}
                    onChange={(e) =>
                      setEditingCrew({ ...editingCrew, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Rarity Tier</label>
                  <select
                    className={inputClass}
                    value={editingCrew.tier}
                    onChange={(e) =>
                      setEditingCrew({
                        ...editingCrew,
                        tier: e.target.value as FullArtTier,
                      })
                    }
                  >
                    {FULL_ART_TIERS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className={labelClass}>Category</label>
                  <input
                    className={inputClass}
                    value={editingCrew.category}
                    maxLength={28}
                    onChange={(e) =>
                      setEditingCrew({ ...editingCrew, category: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Icon Emoji</label>
                  <input
                    className={inputClass}
                    value={editingCrew.icon}
                    maxLength={6}
                    onChange={(e) =>
                      setEditingCrew({ ...editingCrew, icon: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Backdrop Colour</label>
                  <input
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                    value={editingCrew.accentColor}
                    onChange={(e) =>
                      setEditingCrew({ ...editingCrew, accentColor: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Short Advantage Headline (Ability Line)</label>
                  <input
                    className={inputClass}
                    value={editingCrew.ability}
                    maxLength={48}
                    onChange={(e) =>
                      setEditingCrew({ ...editingCrew, ability: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Standard Pack Pull Weight (1–100)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={inputClass}
                    value={editingCrew.pullWeight}
                    onChange={(e) =>
                      setEditingCrew({
                        ...editingCrew,
                        pullWeight: Math.max(1, Math.min(100, Number(e.target.value) || 10)),
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Detailed Advantage Description</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={editingCrew.effect}
                  maxLength={160}
                  onChange={(e) =>
                    setEditingCrew({ ...editingCrew, effect: e.target.value })
                  }
                />
              </div>

              {/* Positive Modifiers Editor */}
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-3.5 space-y-3">
                <span className="block text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-300">
                  ⚡ Positive Advantage Modifiers (Applied when played on a Corner)
                </span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {(["driftBonus", "accelBonus", "gripBonus", "steerBonus"] as const).map(
                    (field) => (
                      <div key={field}>
                        <label className={labelClass}>
                          +{field.replace("Bonus", "").toUpperCase()}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          className={inputClass}
                          value={editingCrew.modifiers?.[field] ?? 0}
                          onChange={(e) =>
                            setEditingCrew({
                              ...editingCrew,
                              modifiers: {
                                ...editingCrew.modifiers,
                                [field]: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                              },
                            })
                          }
                        />
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className={labelClass}>Flat Corner Bonus Pts</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className={inputClass}
                      value={editingCrew.modifiers?.flatBonus ?? 0}
                      onChange={(e) =>
                        setEditingCrew({
                          ...editingCrew,
                          modifiers: {
                            ...editingCrew.modifiers,
                            flatBonus: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Underdog Bonus (Bronze/Silver)</label>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      className={inputClass}
                      value={editingCrew.modifiers?.underdogBonus ?? 0}
                      onChange={(e) =>
                        setEditingCrew({
                          ...editingCrew,
                          modifiers: {
                            ...editingCrew.modifiers,
                            underdogBonus: Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Corner Debuff Shield</label>
                    <select
                      className={inputClass}
                      value={String(editingCrew.modifiers?.debuffShield ?? 0)}
                      onChange={(e) =>
                        setEditingCrew({
                          ...editingCrew,
                          modifiers: {
                            ...editingCrew.modifiers,
                            debuffShield: Number(e.target.value) || 0,
                          },
                        })
                      }
                    >
                      <option value="0">None (0%)</option>
                      <option value="0.5">50% Debuff Reduction</option>
                      <option value="1">100% Debuff Immunity</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Optional Custom Image Upload */}
              <div className="rounded-2xl border border-zinc-200 p-3.5 space-y-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    🖼️ Custom Card Image (Optional — Uses Icon Artwork if Empty)
                  </span>
                  {editingCrew.customImageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCrew({
                          ...editingCrew,
                          customImageUrl: "",
                          imageZoom: 100,
                          imageX: 50,
                          imageY: 50,
                        })
                      }
                      className="text-xs font-bold text-rose-500 hover:underline"
                    >
                      Revert to Icon Artwork
                    </button>
                  )}
                </div>
                <ImageUploader
                  maxFiles={1}
                  label="Upload Custom Crew Card Artwork"
                  initialUrls={editingCrew.customImageUrl ? [editingCrew.customImageUrl] : []}
                  onUploadComplete={(urls) =>
                    setEditingCrew({
                      ...editingCrew,
                      customImageUrl: urls[0] ?? "",
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* 2. DEBUFF CARD EDITOR */}
          {subTab === "debuff" && editingDebuff && (
            <section className={`${panelClass} space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">
                    Editing Corner Debuff Card #{String(editingDebuff.setNumber).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                    {editingDebuff.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteOrResetDebuff(editingDebuff)}
                    disabled={pending}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {DEBUFF_CARD_SET.some((c) => c.id === editingDebuff.id)
                      ? "↺ Reset to Default"
                      : "🗑️ Delete Card"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDebuffCard}
                    disabled={pending}
                    className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-rose-400 disabled:opacity-50"
                  >
                    {pending ? "Saving…" : "💾 Save Debuff Card"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Debuff Card Name</label>
                  <input
                    className={inputClass}
                    value={editingDebuff.name}
                    maxLength={40}
                    onChange={(e) =>
                      setEditingDebuff({ ...editingDebuff, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Severity Tier</label>
                  <select
                    className={inputClass}
                    value={editingDebuff.tier}
                    onChange={(e) =>
                      setEditingDebuff({
                        ...editingDebuff,
                        tier: e.target.value as FullArtTier,
                      })
                    }
                  >
                    {FULL_ART_TIERS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className={labelClass}>Hazard Category</label>
                  <input
                    className={inputClass}
                    value={editingDebuff.category}
                    maxLength={28}
                    onChange={(e) =>
                      setEditingDebuff({ ...editingDebuff, category: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Icon Emoji</label>
                  <input
                    className={inputClass}
                    value={editingDebuff.icon}
                    maxLength={6}
                    onChange={(e) =>
                      setEditingDebuff({ ...editingDebuff, icon: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Backdrop Colour</label>
                  <input
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                    value={editingDebuff.accentColor}
                    onChange={(e) =>
                      setEditingDebuff({
                        ...editingDebuff,
                        accentColor: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Short Hazard Rule (Ability Line)</label>
                <input
                  className={inputClass}
                  value={editingDebuff.ability}
                  maxLength={48}
                  onChange={(e) =>
                    setEditingDebuff({ ...editingDebuff, ability: e.target.value })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>Detailed Hazard Description</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={editingDebuff.effect}
                  maxLength={160}
                  onChange={(e) =>
                    setEditingDebuff({ ...editingDebuff, effect: e.target.value })
                  }
                />
              </div>

              {/* Debuff Penalties Editor */}
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 space-y-3">
                <span className="block text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-300">
                  ⚠️ Corner Debuff Penalties (Applied symmetrically to BOTH drivers)
                </span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {(
                    [
                      ["driftPenalty", "-DRIFT"],
                      ["accelPenalty", "-ACCEL"],
                      ["gripPenalty", "-GRIP"],
                      ["steerPenalty", "-STEER"],
                      ["flatPenalty", "-FLAT PTS"],
                    ] as const
                  ).map(([field, lbl]) => (
                    <div key={field}>
                      <label className={labelClass}>{lbl}</label>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        className={inputClass}
                        value={editingDebuff.penalties?.[field] ?? 0}
                        onChange={(e) =>
                          setEditingDebuff({
                            ...editingDebuff,
                            penalties: {
                              ...editingDebuff.penalties,
                              [field]: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Image Upload */}
              <div className="rounded-2xl border border-zinc-200 p-3.5 space-y-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    🖼️ Custom Debuff Artwork (Optional — Uses Icon if Empty)
                  </span>
                  {editingDebuff.customImageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingDebuff({
                          ...editingDebuff,
                          customImageUrl: "",
                        })
                      }
                      className="text-xs font-bold text-rose-500 hover:underline"
                    >
                      Revert to Icon Artwork
                    </button>
                  )}
                </div>
                <ImageUploader
                  maxFiles={1}
                  label="Upload Custom Debuff Card Artwork"
                  initialUrls={editingDebuff.customImageUrl ? [editingDebuff.customImageUrl] : []}
                  onUploadComplete={(urls) =>
                    setEditingDebuff({
                      ...editingDebuff,
                      customImageUrl: urls[0] ?? "",
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* 3. UK TRACK CARD EDITOR */}
          {subTab === "track" && editingTrack && (
            <section className={`${panelClass} space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                    Editing UK Drift Track Card #{String(editingTrack.setNumber).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                    {editingTrack.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteOrResetTrack(editingTrack)}
                    disabled={pending}
                    className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {UK_TRACK_CARD_SET.some((c) => c.id === editingTrack.id)
                      ? "↺ Reset to Default"
                      : "🗑️ Delete Track"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTrackCard}
                    disabled={pending}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-black shadow-sm hover:bg-amber-400 disabled:opacity-50"
                  >
                    {pending ? "Saving…" : "💾 Save UK Track Card"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div className="space-y-0.5">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-500 dark:text-amber-400">
                    All UK Tracks are Gold Venue Cards
                  </span>
                  <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                    Tracks do not have locked permanent buffs or debuffs. Track Buffs and Track Hazards are dynamically randomised per match on spin so every game is fresh!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>UK Track / Venue Name</label>
                  <input
                    className={inputClass}
                    value={editingTrack.name}
                    maxLength={40}
                    onChange={(e) =>
                      setEditingTrack({ ...editingTrack, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Track Prestige Tier</label>
                  <select
                    className={inputClass}
                    value={editingTrack.tier}
                    onChange={(e) =>
                      setEditingTrack({
                        ...editingTrack,
                        tier: e.target.value as FullArtTier,
                      })
                    }
                  >
                    {FULL_ART_TIERS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className={labelClass}>UK Region &amp; Surface</label>
                  <input
                    className={inputClass}
                    value={editingTrack.region}
                    maxLength={32}
                    onChange={(e) =>
                      setEditingTrack({ ...editingTrack, region: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Icon Emoji</label>
                  <input
                    className={inputClass}
                    value={editingTrack.icon}
                    maxLength={6}
                    onChange={(e) =>
                      setEditingTrack({ ...editingTrack, icon: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Backdrop Colour</label>
                  <input
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-xl border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
                    value={editingTrack.accentColor}
                    onChange={(e) =>
                      setEditingTrack({
                        ...editingTrack,
                        accentColor: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Track Buff Callout (Shown in Clash)</label>
                  <input
                    className={inputClass}
                    value={editingTrack.buffLabel}
                    maxLength={80}
                    onChange={(e) =>
                      setEditingTrack({ ...editingTrack, buffLabel: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Track Debuff Callout (Shown in Clash)</label>
                  <input
                    className={inputClass}
                    value={editingTrack.debuffLabel}
                    maxLength={80}
                    onChange={(e) =>
                      setEditingTrack({ ...editingTrack, debuffLabel: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Card Ability Line</label>
                <input
                  className={inputClass}
                  value={editingTrack.ability}
                  maxLength={48}
                  onChange={(e) =>
                    setEditingTrack({ ...editingTrack, ability: e.target.value })
                  }
                />
              </div>

              <div>
                <label className={labelClass}>Card Description</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={editingTrack.effect}
                  maxLength={160}
                  onChange={(e) =>
                    setEditingTrack({ ...editingTrack, effect: e.target.value })
                  }
                />
              </div>

              {/* Track Stat Buffs */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                <span className="block text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                  🇬🇧 UK Track Stat Buffs (Applied to cars racing at this venue)
                </span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {(["driftBuff", "accelBuff", "gripBuff", "steerBuff"] as const).map(
                    (field) => (
                      <div key={field}>
                        <label className={labelClass}>
                          +{field.replace("Buff", "").toUpperCase()}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          className={inputClass}
                          value={editingTrack.rules?.[field] ?? 0}
                          onChange={(e) =>
                            setEditingTrack({
                              ...editingTrack,
                              rules: {
                                ...editingTrack.rules,
                                [field]: Math.max(0, Math.min(4, Number(e.target.value) || 0)),
                              },
                            })
                          }
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Custom Image Upload */}
              <div className="rounded-2xl border border-zinc-200 p-3.5 space-y-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    🖼️ Custom UK Track Photo/Artwork (Optional — Uses Icon if Empty)
                  </span>
                  {editingTrack.customImageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingTrack({
                          ...editingTrack,
                          customImageUrl: "",
                        })
                      }
                      className="text-xs font-bold text-rose-500 hover:underline"
                    >
                      Revert to Icon Artwork
                    </button>
                  )}
                </div>
                <ImageUploader
                  maxFiles={1}
                  label="Upload UK Track Photo or Artwork"
                  initialUrls={editingTrack.customImageUrl ? [editingTrack.customImageUrl] : []}
                  onUploadComplete={(urls) =>
                    setEditingTrack({
                      ...editingTrack,
                      customImageUrl: urls[0] ?? "",
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* Card Set Grid Selector */}
          <section className={`${panelClass} space-y-3`}>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              {subTab === "crew"
                ? `All ${crewCards.length} Crew Advantage Cards (Tap any card to edit)`
                : subTab === "debuff"
                  ? `All ${debuffCards.length} Corner Debuff Cards (Tap any card to edit)`
                  : `All ${trackCards.length} UK Drift Track Cards (Tap any card to edit)`}
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {subTab === "crew" &&
                crewCards.map((def) => {
                  const active = editingCrew?.id === def.id;
                  const cardData = { id: def.id, ...crewDefinitionToCardData(def) };
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setEditingCrew(def)}
                      className={`flex flex-col justify-between rounded-2xl border-2 p-2 text-left transition-all hover:-translate-y-0.5 ${
                        active
                          ? "border-cyan-500 bg-cyan-500/10 shadow-md"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                      }`}
                    >
                      <FullArtCard card={cardData} />
                      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
                        <span className="font-black text-zinc-700 dark:text-zinc-300 truncate">
                          #{String(def.setNumber).padStart(2, "0")} {def.name}
                        </span>
                      </div>
                    </button>
                  );
                })}

              {subTab === "debuff" &&
                debuffCards.map((def) => {
                  const active = editingDebuff?.id === def.id;
                  const cardData = debuffDefinitionToCardData(def);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setEditingDebuff(def)}
                      className={`flex flex-col justify-between rounded-2xl border-2 p-2 text-left transition-all hover:-translate-y-0.5 ${
                        active
                          ? "border-rose-500 bg-rose-500/10 shadow-md"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                      }`}
                    >
                      <FullArtCard card={cardData} />
                      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
                        <span className="font-black text-zinc-700 dark:text-zinc-300 truncate">
                          #{String(def.setNumber).padStart(2, "0")} {def.name}
                        </span>
                      </div>
                    </button>
                  );
                })}

              {subTab === "track" &&
                trackCards.map((def) => {
                  const active = editingTrack?.id === def.id;
                  const cardData = trackDefinitionToCardData(def);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setEditingTrack(def)}
                      className={`flex flex-col justify-between rounded-2xl border-2 p-2 text-left transition-all hover:-translate-y-0.5 ${
                        active
                          ? "border-amber-500 bg-amber-500/10 shadow-md"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                      }`}
                    >
                      <FullArtCard card={cardData} />
                      <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
                        <span className="font-black text-zinc-700 dark:text-zinc-300 truncate">
                          #{String(def.setNumber).padStart(2, "0")} {def.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
      )}
    </div>
  );
}

