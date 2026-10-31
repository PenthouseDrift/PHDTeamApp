"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type HowToPlayTab =
  | "quickstart"
  | "durability"
  | "maintenance"
  | "crew"
  | "tracks"
  | "scoring";

export interface ClashHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HowToPlayTab;
  onOpenCatalog?: (category: "crew" | "debuff" | "track") => void;
}

const TABS: Array<{
  id: HowToPlayTab;
  label: string;
  shortLabel: string;
  icon: string;
  badge?: string;
}> = [
  {
    id: "quickstart",
    label: "3-Corner Clash",
    shortLabel: "Rules",
    icon: "🏁",
  },
  {
    id: "durability",
    label: "Durability & Faults",
    shortLabel: "Faults",
    icon: "🔋",
    badge: "NEW",
  },
  {
    id: "maintenance",
    label: "Pit Maintenance",
    shortLabel: "Repairs",
    icon: "🛠️",
    badge: "NEW",
  },
  {
    id: "crew",
    label: "Crew Advantages",
    shortLabel: "Crew",
    icon: "⚡",
  },
  {
    id: "tracks",
    label: "UK Tracks & Hazards",
    shortLabel: "Tracks",
    icon: "🇬🇧",
  },
  {
    id: "scoring",
    label: "Scoring & Rewards",
    shortLabel: "Scoring",
    icon: "📊",
  },
];

export function ClashHowToPlayModal({
  isOpen,
  onClose,
  initialTab = "quickstart",
  onOpenCatalog,
}: ClashHowToPlayModalProps) {
  const [activeTab, setActiveTab] = useState<HowToPlayTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex h-[100dvh] w-screen items-stretch justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Tandem Clash Driver Manual & How to Play"
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-amber-500/40 sm:shadow-[0_0_50px_rgba(245,158,11,0.25)]">
        {/* Header Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500 text-base font-black text-black shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              🏁
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                Official Driver Manual · Penthouse Tandem Clash
              </span>
              <h2 className="text-base font-black text-white sm:text-lg">
                How Tandem Clash Works
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            ✕ Close
          </button>
        </div>

        {/* Tab Selection Strip */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-zinc-800/90 bg-zinc-950 p-2 sm:px-6 no-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all ${
                  isActive
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                    : "border border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                      isActive
                        ? "bg-black text-amber-400"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-zinc-300 text-xs sm:text-sm">
          {/* TAB 1: 3-CORNER CLASH QUICK START */}
          {activeTab === "quickstart" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  Head-to-Head RC Drift Battles
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  Welcome to Tandem Clash!
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  Drift Clash is a competitive, arcade-style 3-corner drift battle engine. You build a lineup of <strong>3 Car Cards</strong> and <strong>3 Crew Advantage Cards</strong>, match against rival community drivers or track legends, and battle across 3 iconic corners to claim victory!
                </p>
              </div>

              {/* 4-Step Flow */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-black">
                      1
                    </span>
                    <h4 className="font-black text-white">UK Track Roulette</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    First, a cinematic wheel spins to roll an authentic <strong>UK RC Drift Track Card</strong> (Penthouse Drift P-Tile, ASBO RC, Slide House, Outlaw RC, etc.). Every venue brings unique track surface rules, buffs, and hazards alongside matching your rival.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-black">
                      2
                    </span>
                    <h4 className="font-black text-white">Lineup &amp; Loaner Support</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Knowing the venue conditions, select 3 Car Cards and 3 Crew Cards tailored for this track. If you’re low on cards or your cars are broken, <strong>Academy Loaner Cars &amp; Crew</strong> automatically backfill slots so you can always race.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-xs font-black text-black">
                      3
                    </span>
                    <h4 className="font-black text-white">Tactical Car &amp; Crew Play</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    On each of the 3 corners, you decide which of your remaining cars takes the track, then play 1 remaining Crew Card to gain powerful stat boosts, flat point bonuses, or debuff shielding.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white">
                      4
                    </span>
                    <h4 className="font-black text-white">Shared Debuffs &amp; Verdict</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    A random hazard strikes <em>both</em> drivers on each corner. Corner scores calculate automatically. The driver who wins <strong>2 out of 3 corners</strong> takes the match victory and rewards!
                  </p>
                </div>
              </div>

              {/* Corner Types Tip */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">
                  🏁 Understanding the 3 Corner Types
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5">
                    <strong className="text-white block">Corner 1 · High Speed Entry</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Prioritises <strong>DRIFT (×2)</strong> and <strong>ACCEL (×1.5)</strong> for aggressive angle and speed.
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5">
                    <strong className="text-white block">Corner 2 · Chase &amp; Wall Ride</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Prioritises <strong>STEER (×2)</strong> and <strong>GRIP (×1.5)</strong> for proximity and line control.
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5">
                    <strong className="text-white block">Corner 3 · Final Apex Switch</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Prioritises <strong>STEER (×2)</strong> and <strong>DRIFT (×1.5)</strong> for razor-sharp transitions.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DURABILITY & MECHANICAL FAULTS */}
          {activeTab === "durability" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  New Game Feature
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  🔋 Car Durability &amp; Mechanical Breakdowns
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  RC drift cars endure punishing strain during tandem battles. Every car in your garage has a limited battle lifespan before needing maintenance!
                </p>
              </div>

              {/* How Durability Works */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <div className="text-xl mb-1">🔋</div>
                  <h4 className="font-black text-white text-xs sm:text-sm">2–10 Battles Lifespan</h4>
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    Fresh car cards pulled from packs roll with an initial durability of <strong>2 to 10 battles</strong>. Every played match consumes 1 battle of durability.
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
                  <div className="text-xl mb-1">⚠️</div>
                  <h4 className="font-black text-rose-300 text-xs sm:text-sm">Mechanical Breakdown</h4>
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    When a car’s durability reaches 0, it suffers <strong>1 of 4 mechanical faults</strong> and cannot enter battles until repaired.
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <div className="text-xl mb-1">⏳</div>
                  <h4 className="font-black text-cyan-300 text-xs sm:text-sm">Pit Bench Cooldown</h4>
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    Broken cars require <strong>2 to 5 sit-out battles</strong> to repair on the bench. Each match you finish with other cars reduces cooldown by 1.
                  </p>
                </div>
              </div>

              {/* The 4 Faults Breakdown */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-3">
                  ⚠️ The 4 Mechanical Breakdown Types
                </h4>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <span className="text-2xl">⚙️</span>
                    <div>
                      <strong className="text-white text-xs sm:text-sm block">Engine / Motor Fault</strong>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Overheated stator windings, rotor desynchronisation, or demagnetised brushless motor.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <span className="text-2xl">🕹️</span>
                    <div>
                      <strong className="text-white text-xs sm:text-sm block">Transmission / Drivetrain Fault</strong>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Stripped spur/pinion gear mesh, belt delamination, or slipping ball differential.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <span className="text-2xl">🔧</span>
                    <div>
                      <strong className="text-white text-xs sm:text-sm block">Suspension &amp; Steering Fault</strong>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Bent turnbuckle tie-rod, popped steering wiper ball cup, or leaking damper seals.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <strong className="text-white text-xs sm:text-sm block">Electronics &amp; ESC Fault</strong>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        ESC thermal shutdown, loose sensor cable wire, or low-voltage servo glitch.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pro Tip */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <strong>💡 Pro Tip:</strong> Keep a diverse garage of cars! When your primary drift car is in the pit garage, rotate to your backup chassis or use a <strong>Maintenance Consumable Card</strong> for an instant fix.
              </div>
            </div>
          )}

          {/* TAB 3: PIT MAINTENANCE CONSUMABLES */}
          {activeTab === "maintenance" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  New Consumable Cards
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  🛠️ Maintenance Consumable Cards
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  Don&apos;t want to wait 2–5 battles for your prized legendary car to repair on the bench? Use a <strong>Maintenance Consumable Card</strong> for rapid pit repairs!
                </p>
              </div>

              {/* Rarity & Repair Amounts */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-3">
                  📦 Consumable Rarity &amp; Repair Reductions
                </h4>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-3 text-center">
                    <span className="text-sm font-black text-orange-400 uppercase">🥉 Bronze</span>
                    <span className="my-1 block text-lg font-black text-white">-1 Battle</span>
                    <span className="text-[10px] text-zinc-400">Standard pack pull</span>
                  </div>

                  <div className="rounded-xl border border-zinc-400/30 bg-zinc-800/40 p-3 text-center">
                    <span className="text-sm font-black text-zinc-300 uppercase">🥈 Silver</span>
                    <span className="my-1 block text-lg font-black text-white">-2 Battles</span>
                    <span className="text-[10px] text-zinc-400">1 in 5 odds</span>
                  </div>

                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-950/20 p-3 text-center">
                    <span className="text-sm font-black text-yellow-400 uppercase">🥇 Gold</span>
                    <span className="my-1 block text-lg font-black text-white">-3 Battles</span>
                    <span className="text-[10px] text-zinc-400">1 in 20 odds</span>
                  </div>

                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/20 p-3 text-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    <span className="text-sm font-black text-amber-300 uppercase">👑 Legend</span>
                    <span className="my-1 block text-lg font-black text-amber-300">-5 Battles</span>
                    <span className="text-[10px] text-amber-200">Instant Full Overhaul!</span>
                  </div>
                </div>
              </div>

              {/* How to use */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <h4 className="text-xs font-black text-white mb-1">1. Match the Specific Issue</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Repair kits match 1 of the 4 faults: ⚙️ Engine, 🕹️ Transmission, 🔧 Suspension, or ⚡ Electronics. Ensure you own the matching kit for your car&apos;s issue.
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                  <h4 className="text-xs font-black text-white mb-1">2. Instant 1-Tap Quick Fix</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Inside the <strong>Clash Arena car picker</strong>, broken cars display a <strong>🛠️ Quick Fix</strong> button if you own a matching kit. Tap to repair instantly without leaving the match!
                  </p>
                </div>
              </div>

              {/* Pack drop guarantee */}
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs text-cyan-200">
                <strong>🎁 Guaranteed Pack Drops:</strong> Every Standard Card Pack opened now guarantees <strong>1 Maintenance Consumable Card</strong> alongside your car and bonus crew cards!
              </div>
            </div>
          )}

          {/* TAB 4: CREW ADVANTAGE CARDS */}
          {activeTab === "crew" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  100% Positive Buffs
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  ⚡ Crew Advantage Cards &amp; Rarity Scaling
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  Crew Cards represent your pit team, tuner specialists, and track spotters. Every crew card grants positive buffs with zero downsides!
                </p>
              </div>

              {/* Rarity Scaling Explanation */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">
                  ✨ Rarity Scaling on Crew Cards
                </h4>
                <p className="text-xs text-zinc-300 mb-3 leading-relaxed">
                  When you pull Crew Cards in card packs, they can drop in 4 rarity tiers. Higher tiers amplify their positive advantages:
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <strong className="text-orange-400 block">🥉 Bronze Tier (Standard)</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Base tuning advantage (e.g. +1 to a stat, +2 flat corner score points).
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <strong className="text-zinc-300 block">🥈 Silver Tier (1 in 5 odds)</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Amplified modifiers (+2 to primary stats, extra corner score points).
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <strong className="text-yellow-400 block">🥇 Gold Tier (1 in 20 odds)</strong>
                    <span className="text-zinc-400 text-[11px]">
                      High-spec advantages (multi-stat bonuses, strong underdog multipliers).
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
                    <strong className="text-amber-300 block">👑 Legend Tier (1 in 40 odds)</strong>
                    <span className="text-zinc-400 text-[11px]">
                      Max-tier advantages: huge stat spikes and up to <strong>100% Debuff Immunity Shielding</strong>!
                    </span>
                  </div>
                </div>
              </div>

              {/* Catalog CTA */}
              {onOpenCatalog && (
                <div className="flex items-center justify-between rounded-2xl border border-cyan-500/40 bg-zinc-900 p-4">
                  <div>
                    <strong className="text-white text-xs sm:text-sm block">
                      Explore All 28 Crew Advantage Cards
                    </strong>
                    <span className="text-zinc-400 text-xs">
                      Inspect all cards, abilities, and rarity variations in the interactive catalog.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCatalog("crew");
                    }}
                    className="rounded-xl bg-cyan-500 px-3.5 py-2 text-xs font-black text-black hover:bg-cyan-400"
                  >
                    View Crew Set →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: UK TRACKS & DEBUFFS */}
          {activeTab === "tracks" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  Iconic UK Venues
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  🇬🇧 UK Track Cards &amp; Dynamic Hazards
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  Every match rolls an official UK RC Drift venue with unique surface properties and track conditions.
                </p>
              </div>

              {/* Track anatomy */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">🟢</span>
                    <h4 className="font-black text-emerald-300 text-xs sm:text-sm">Track Buffs</h4>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Venues reward drivers who match the track layout. E.g. Penthouse Drift rewards high-angle drift setups; Slide House awards underdog bonuses to Bronze and Silver grassroots cars!
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">🔴</span>
                    <h4 className="font-black text-rose-300 text-xs sm:text-sm">Track Hazards</h4>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Slick P-tile, polished concrete, or tight technical barriers penalize cars that don&apos;t meet specific balance or grip thresholds.
                  </p>
                </div>
              </div>

              {/* Shared Corner Debuffs */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">
                  ⚠️ Shared Corner Debuffs
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  On each corner, a hazard is rolled that affects <strong>both drivers equally</strong> (e.g. <em>Slick Patch</em>, <em>Gyro Wobble</em>, or <em>Wall Brush</em>).
                  <br />
                  <span className="text-cyan-300 font-bold">
                    💡 Tactical Tip: Crew Cards with <strong>Debuff Shielding</strong> protect your score from these penalties!
                  </span>
                </p>
              </div>

              {/* Catalog CTA */}
              {onOpenCatalog && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-900 p-4">
                  <div>
                    <strong className="text-white text-xs sm:text-sm block">
                      Explore UK Tracks &amp; Debuff Hazard Cards
                    </strong>
                    <span className="text-zinc-400 text-xs">
                      Learn track surface rules and prepare your setup before the green flag drops.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCatalog("track");
                      }}
                      className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-black hover:bg-emerald-400"
                    >
                      🇬🇧 Tracks
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCatalog("debuff");
                      }}
                      className="rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-400"
                    >
                      ⚠️ Debuffs
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SCORING & REWARDS */}
          {activeTab === "scoring" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  Telemetry &amp; Economics
                </span>
                <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">
                  📊 Scoring Telemetry &amp; Battle Rewards
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                  Understand exactly how corner scores are calculated and how to maximize your daily P-Credits earnings.
                </p>
              </div>

              {/* Scoring Formula */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">
                  📐 The Official Corner Score Formula
                </h4>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-amber-300 overflow-x-auto">
                  Score = (Corner Stat Multipliers) + Tier Bonus + Crew Advantage + Track Modifiers - Debuff Penalty
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-zinc-400">
                  <div>
                    <strong className="text-white block">Stat Weights (1–25 scale · x/100 Total)</strong>
                    Each corner weights your 4 car stats differently (e.g. Entry multiplies Drift × 2 and Accel × 1.5).
                  </div>
                  <div>
                    <strong className="text-white block">Rarity Tier Bonus</strong>
                    Bronze (+0), Silver (+2), Gold (+5), Legend (+8), Mythic (+12).
                  </div>
                </div>
              </div>

              {/* Rewards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-500/30 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">🪙</span>
                    <h4 className="font-black text-white text-xs sm:text-sm">+25 P-Credits Daily Win</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Win your first Tandem Clash of the day to instantly claim <strong>25 P-Credits</strong> to spend in the Pack Store or Marketplace!
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-500/30 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">🔥</span>
                    <h4 className="font-black text-white text-xs sm:text-sm">Win Streak Bonuses</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Build consecutive win streaks! Every 3-win milestone rewards bonus <strong>+10 P-Credits</strong> and boosts your Hall of Fame ranking.
                  </p>
                </div>
              </div>

              {/* Bottom Ready Button */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-amber-500/25 transition-all hover:bg-amber-400 active:scale-95"
                >
                  🏁 Ready to Clash — Back to the Grid
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

