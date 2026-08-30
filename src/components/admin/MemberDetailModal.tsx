"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  activateMembership,
  revokeMembership,
  clearMembershipRecord,
  adminAdjustWallet,
  setMemberDiscounts,
} from "@/actions/admin/membership";
import { BASE_PRICES, EMPTY_DISCOUNTS } from "@/lib/pricing";
import { quickCheckIn, checkInWithDayPass, checkInWithRental } from "@/actions/admin/checkins";
import { setUserRole } from "@/actions/admin/users";
import { getOrCreateQRCode } from "@/actions/qr";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberDetailModalProps {
  member: MemberWithMembership;
  onClose: () => void;
  onUpdate: (feedback: { type: "success" | "error"; message: string }) => void;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getRemainingDays(expiresAt: number) {
  const diff = expiresAt - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function MemberDetailModal({ member: initialMember, onClose, onUpdate }: MemberDetailModalProps) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [localWallet, setLocalWallet] = useState(initialMember.wallet);
  const [localMembership, setLocalMembership] = useState(initialMember.membership);
  const [localRole, setLocalRole] = useState<"admin" | "moderator" | "member">(initialMember.member.role);
  const [overrideDate, setOverrideDate] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [confirmingInPersonMembership, setConfirmingInPersonMembership] = useState(false);
  const [pendingRole, setPendingRole] = useState<"admin" | "moderator" | "member" | null>(null);
  const [revokeStep, setRevokeStep] = useState<1 | 2>(1);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [discounts, setDiscounts] = useState({
    membership: String(initialMember.member.discounts?.membership ?? EMPTY_DISCOUNTS.membership),
    daypass: String(initialMember.member.discounts?.daypass ?? EMPTY_DISCOUNTS.daypass),
    rental: String(initialMember.member.discounts?.rental ?? EMPTY_DISCOUNTS.rental),
  });

  const m = initialMember.member;
  const isAdmin = m.role === "admin";
  const membershipActive = localMembership?.status === "active";

  // Load QR code via server action
  useEffect(() => {
    getOrCreateQRCode(m.id).then((res) => {
      if (res.success) setQrUrl(res.data);
    });
  }, [m.id]);

  // Trap escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleSaveDiscounts() {
    startTransition(async () => {
      const res = await setMemberDiscounts(m.id, {
        membership: Number(discounts.membership) || 0,
        daypass: Number(discounts.daypass) || 0,
        rental: Number(discounts.rental) || 0,
      });
      if (res.success) {
        setDiscounts({
          membership: String(res.data.membership),
          daypass: String(res.data.daypass),
          rental: String(res.data.rental),
        });
        onUpdate({ type: "success", message: `Discounts saved for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleAdjustWallet(itemType: "daypass" | "rental", delta: number) {
    startTransition(async () => {
      const res = await adminAdjustWallet(m.id, itemType, delta);
      if (res.success) {
        setLocalWallet((prev) => ({ ...prev, ...res.data }));
        onUpdate({ type: "success", message: `Wallet updated for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleActivate() {
    startTransition(async () => {
      const res = await activateMembership(m.id);
      if (res.success) {
        setLocalMembership({
          userId: m.id,
          status: "active",
          purchasedAt: Date.now(),
          expiresAt: res.data.expiresAt,
          paymentRef: `manual_${Date.now()}`,
        });
        onUpdate({ type: "success", message: `Membership activated for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleOverrideDate() {
    if (!overrideDate) return;
    startTransition(async () => {
      const res = await activateMembership(m.id, overrideDate);
      if (res.success) {
        setLocalMembership({
          userId: m.id,
          status: "active",
          purchasedAt: Date.now(),
          expiresAt: res.data.expiresAt,
          paymentRef: `manual_${Date.now()}`,
        });
        setShowOverride(false);
        setOverrideDate("");
        onUpdate({ type: "success", message: `Membership expiry set for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleClearExpiry() {
    startTransition(async () => {
      const res = await clearMembershipRecord(m.id);
      if (res.success) {
        setLocalMembership(null);
        setShowOverride(false);
        setOverrideDate("");
        onUpdate({ type: "success", message: `Membership record cleared for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokeMembership(m.id);
      if (res.success) {
        setLocalMembership((prev) =>
          prev ? { ...prev, status: "expired", expiresAt: Date.now() - 1000 } : null
        );
        setShowRevoke(false);
        setRevokeStep(1);
        onUpdate({ type: "success", message: `Membership revoked for ${m.name}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleCheckInStandard() {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await quickCheckIn(m.id, m.name, session.user.id);
      if (res.success) {
        onUpdate({ type: "success", message: `${m.name} checked in (Standard)!` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleCheckInDayPass(isPaidInPerson: boolean) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await checkInWithDayPass(m.id, m.name, session.user.id, isPaidInPerson);
      if (res.success) {
        if (!isPaidInPerson) {
          setLocalWallet((w) => ({ ...w, dayPasses: Math.max(0, w.dayPasses - 1) }));
        }
        onUpdate({ type: "success", message: `${m.name} checked in with Day Pass ${isPaidInPerson ? "(Paid £10)" : "(Wallet Pass)"}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleCheckInRental(isPaidInPerson: boolean) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await checkInWithRental(m.id, m.name, session.user.id, isPaidInPerson);
      if (res.success) {
        if (!isPaidInPerson) {
          setLocalWallet((w) => ({ ...w, rentalHours: Math.max(0, w.rentalHours - 1) }));
        }
        onUpdate({ type: "success", message: `${m.name} checked in with Car Rental ${isPaidInPerson ? "(Paid £10)" : "(Wallet Pass)"}` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  function handleCheckInWithInPersonMembership() {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const memRes = await activateMembership(m.id);
      if (memRes.success) {
        setLocalMembership({
          userId: m.id,
          status: "active",
          purchasedAt: Date.now(),
          expiresAt: memRes.data.expiresAt,
          paymentRef: `cash_membership_${Date.now()}`,
        });
        const checkInRes = await quickCheckIn(m.id, m.name, session.user.id, "membership_cash");
        if (checkInRes.success) {
          onUpdate({
            type: "success",
            message: `${m.name} 28-day membership activated (£40 Paid in Person) & checked in!`,
          });
        } else {
          onUpdate({
            type: "success",
            message: `${m.name} 28-day membership activated (£40 Paid in Person)!`,
          });
        }
      } else {
        onUpdate({ type: "error", message: memRes.error });
      }
    });
  }

  function handleSetRole(newRole: "admin" | "moderator" | "member") {
    startTransition(async () => {
      const res = await setUserRole(m.id, newRole);
      if (res.success) {
        setLocalRole(newRole);
        onUpdate({
          type: "success",
          message: `Role for ${m.name} changed to ${newRole.toUpperCase()}`,
        });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  const viewerRole = session?.user?.role;
  const isAdminViewer = viewerRole === "admin";
  const isModeratorViewer = viewerRole === "moderator";

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            {m.image ? (
              <img src={m.image} alt={m.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-zinc-200" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center text-amber-600 font-black text-sm flex-shrink-0">
                {m.name[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {m.name}
                  {m.nickname && (
                    <span className="ml-1.5 text-amber-600 font-bold text-sm">&quot;{m.nickname}&quot;</span>
                  )}
                </p>
                {localRole === "admin" ? (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase">
                    Admin
                  </span>
                ) : localRole === "moderator" ? (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase">
                    Moderator
                  </span>
                ) : membershipActive ? (
                  <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 text-[10px] font-black uppercase">
                    Member
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase">
                    User
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 truncate">{m.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 p-2 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Single Check-In Button (Admin & Moderator) */}
          {(isAdminViewer || isModeratorViewer) && (
            <button
              type="button"
              onClick={() => setShowCheckInModal(true)}
              disabled={isPending}
              className="w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              <span>🟢</span> Check-In {m.name}
            </button>
          )}

          {/* QR Code & Member ID */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white p-3 shadow-sm">
              {qrUrl ? (
                <img src={qrUrl} alt="Member QR Code" className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                  <svg className="animate-spin w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-700">
              Member ID: {m.id}
            </p>
          </div>

          {/* AI Advisor Usage */}
          <div className="rounded-xl border border-purple-200/80 dark:border-purple-900/50 bg-gradient-to-br from-purple-500/10 to-indigo-500/5 p-3.5 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">✨</span>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  AI Tuning Generations
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Total AI setup &amp; tuning advice generated
                </p>
              </div>
            </div>
            <span className="text-base font-black text-purple-600 dark:text-purple-400 bg-purple-500/15 border border-purple-500/30 px-3 py-1 rounded-xl">
              {m.aiGenerations || 0}
            </span>
          </div>

          {/* Membership Status (Admin & Moderator) */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Membership</h3>
              {localRole === "admin" ? (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  Admin Access
                </span>
              ) : localRole === "moderator" ? (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Mod Access
                </span>
              ) : null}
            </div>

            {localMembership ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <StatusBadge status={localMembership.status} size="sm" />
                  {membershipActive ? (
                    <span className="text-xs text-zinc-500">
                      {getRemainingDays(localMembership.expiresAt)} days remaining
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800">
                      Expired on {formatDate(localMembership.expiresAt)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <div>
                    <span className="text-zinc-400 block">Purchased</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {localMembership.purchasedAt ? formatDate(localMembership.purchasedAt) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">{membershipActive ? "Expires" : "Expired Date"}</span>
                    <span className={`font-medium ${membershipActive ? "text-zinc-800 dark:text-zinc-200" : "text-red-600 font-bold"}`}>
                      {formatDate(localMembership.expiresAt)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No membership record</p>
            )}

              {/* Membership Actions (Admin Only) */}
              {isAdminViewer && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  {!membershipActive ? (
                    <button
                      onClick={handleActivate}
                      disabled={isPending}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                    >
                      Activate 28-Day Membership
                    </button>
                  ) : (
                    <button
                      onClick={() => { setShowRevoke(true); setRevokeStep(1); }}
                      disabled={isPending}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Revoke Membership
                    </button>
                  )}
                  <button
                    onClick={() => setShowOverride(!showOverride)}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Set Expiry Date
                  </button>
                  {localMembership && (
                    <button
                      onClick={handleClearExpiry}
                      disabled={isPending}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      Clear Expiry
                    </button>
                  )}
                </div>
              )}
              {/* Date Override Inline (Admin only) */}
              {isAdminViewer && showOverride && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={(e) => setOverrideDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleOverrideDate}
                    disabled={!overrideDate || isPending}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "..." : "Set Date"}
                  </button>
                  <button
                    onClick={handleClearExpiry}
                    disabled={isPending}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    Clear Expiry
                  </button>
                  <button
                    onClick={() => { setShowOverride(false); setOverrideDate(""); }}
                    className="px-3 py-2 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 hover:bg-zinc-200 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

          {/* Wallet Balances (Admin Viewer) */}
          {isAdminViewer && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Wallet</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Day Passes */}
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5" />
                    </svg>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Day Passes</span>
                  </div>
                  <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{localWallet.dayPasses}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAdjustWallet("daypass", -1)}
                      disabled={isPending || localWallet.dayPasses <= 0}
                      className="flex-1 py-1.5 text-sm font-bold rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors"
                    >
                      −
                    </button>
                    <button
                      onClick={() => handleAdjustWallet("daypass", 1)}
                      disabled={isPending}
                      className="flex-1 py-1.5 text-sm font-bold rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-green-50 hover:text-green-600 hover:border-green-200 disabled:opacity-40 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Rental Hours */}
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Rental Hours</span>
                  </div>
                  <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{localWallet.rentalHours}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAdjustWallet("rental", -1)}
                      disabled={isPending || localWallet.rentalHours <= 0}
                      className="flex-1 py-1.5 text-sm font-bold rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors"
                    >
                      −
                    </button>
                    <button
                      onClick={() => handleAdjustWallet("rental", 1)}
                      disabled={isPending}
                      className="flex-1 py-1.5 text-sm font-bold rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-green-50 hover:text-green-600 hover:border-green-200 disabled:opacity-40 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Custom Discounts (Admin Viewer) */}
          {isAdminViewer && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Custom Discounts</h3>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Amount off in £ per purchase. Leave 0 for full price. Shown to the member with the original price struck through.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "membership", label: "Membership" },
                  { key: "daypass", label: "Day Pass" },
                  { key: "rental", label: "Rental / hr" },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {label}
                      <span className="text-zinc-400 dark:text-zinc-500"> (of £{BASE_PRICES[key].toFixed(0)})</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">£</span>
                      <input
                        type="number"
                        min={0}
                        max={BASE_PRICES[key]}
                        step="0.5"
                        inputMode="decimal"
                        value={discounts[key]}
                        onChange={(e) => setDiscounts((prev) => ({ ...prev, [key]: e.target.value }))}
                        disabled={isPending}
                        className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-5 pr-2 py-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveDiscounts}
                disabled={isPending}
                className="w-full py-2 rounded-lg bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save Discounts"}
              </button>
            </div>
          )}

          {/* Manage Member Role (Admin Only - Bottom) */}
          {isAdminViewer && (
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 p-4 space-y-2 bg-purple-50/40 dark:bg-purple-950/20">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                  <span>🛡️</span> Manage Member Role
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
                  {localRole}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Change access permission level across Penthouse Drift:
              </p>
              {pendingRole ? (
                <div className="space-y-3 rounded-xl bg-purple-500/10 border border-purple-500/30 p-3 text-center">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                      Step 2 of 2: Confirm Role Change
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingRole(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Change <span className="text-purple-600 dark:text-purple-400 font-extrabold">{m.name}</span>&apos;s role from{" "}
                    <span className="uppercase font-bold text-zinc-600 dark:text-zinc-400">{localRole}</span> to{" "}
                    <span className="uppercase font-black text-amber-500">{pendingRole}</span>?
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {pendingRole === "admin"
                      ? "⚠️ Grants full admin control over users, roles, and settings."
                      : pendingRole === "moderator"
                      ? "ℹ️ Grants moderator access to members, check-ins, and events."
                      : "ℹ️ Standard user level without staff permissions."}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPendingRole(null)}
                      disabled={isPending}
                      className="flex-1 py-2 px-3 text-xs font-bold rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      ← Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSetRole(pendingRole);
                        setPendingRole(null);
                      }}
                      disabled={isPending}
                      className="flex-1 py-2 px-3 text-xs font-black rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isPending ? "Updating..." : `Confirm ${pendingRole.toUpperCase()} ✓`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(["member", "moderator", "admin"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={isPending || localRole === r}
                      onClick={() => setPendingRole(r)}
                      className={`py-2 px-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        localRole === r
                          ? r === "admin"
                            ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-400"
                            : r === "moderator"
                            ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-400"
                            : "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 shadow-md"
                          : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      } disabled:opacity-50 text-center`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Check-In Modal Options Dialog */}
        {showCheckInModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setShowCheckInModal(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-4 border border-zinc-200 dark:border-zinc-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Check-In Options
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Select check-in option for <strong className="text-amber-500">{m.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setShowCheckInModal(false)}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {confirmingInPersonMembership ? (
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-xl">
                    💳
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                      Confirm £40 In-Person Membership
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Activate 28-day membership for <strong className="text-amber-500 font-bold">{m.name}</strong> and perform track check-in for today?
                    </p>
                  </div>
                  <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-800 dark:text-purple-300 font-bold">
                    💰 £40 Payment received in person (Cash / Card)
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingInPersonMembership(false)}
                      disabled={isPending}
                      className="flex-1 py-2.5 px-4 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingInPersonMembership(false);
                        setShowCheckInModal(false);
                        handleCheckInWithInPersonMembership();
                      }}
                      disabled={isPending}
                      className="flex-1 py-2.5 px-4 text-xs font-black rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-colors disabled:opacity-50"
                    >
                      {isPending ? "Activating..." : "Confirm & Activate (£40) ✓"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Option 1: Standard Track (Active Membership / Staff only) */}
                  {(membershipActive || isAdmin || m.role === "moderator") && (
                    <button
                      onClick={() => {
                        setShowCheckInModal(false);
                        handleCheckInStandard();
                      }}
                      disabled={isPending}
                      className="w-full p-3 text-left rounded-xl border border-green-200 dark:border-green-800/60 bg-green-50/50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-bold text-green-800 dark:text-green-300">
                          🟢 Membership Track Access
                        </p>
                        <p className="text-[11px] text-green-600 dark:text-green-400">
                          Free check-in with active membership
                        </p>
                      </div>
                      <span className="text-xs font-bold text-green-700 dark:text-green-300 group-hover:translate-x-0.5 transition-transform">
                        Select →
                      </span>
                    </button>
                  )}

                  {/* Option 2: In-Person 28-Day Membership (£40 Cash/Card) */}
                  {isAdminViewer && (
                    <button
                      onClick={() => {
                        setConfirmingInPersonMembership(true);
                      }}
                      disabled={isPending}
                      className="w-full p-3 text-left rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                          <span>💳</span> 28-Day Membership (£40 Paid Cash/Card)
                        </p>
                        <p className="text-[11px] text-purple-700 dark:text-purple-400">
                          Activates 28-day track membership &amp; checks in for today
                        </p>
                      </div>
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300 group-hover:translate-x-0.5 transition-transform">
                        Select →
                      </span>
                    </button>
                  )}

                  {/* Option 3: Day Pass (Wallet Balance) */}
                  {isAdminViewer && localWallet.dayPasses > 0 && (
                    <button
                      onClick={() => {
                        setShowCheckInModal(false);
                        handleCheckInDayPass(false);
                      }}
                      disabled={isPending}
                      className="w-full p-3 text-left rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          🎫 Use Wallet Day Pass
                        </p>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          {localWallet.dayPasses} pass{localWallet.dayPasses !== 1 ? "es" : ""} remaining in wallet
                        </p>
                      </div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 group-hover:translate-x-0.5 transition-transform">
                        Select →
                      </span>
                    </button>
                  )}

                  {/* Option 3: Day Pass (£10 Cash/Card) */}
                  <button
                    onClick={() => {
                      setShowCheckInModal(false);
                      handleCheckInDayPass(true);
                    }}
                    disabled={isPending}
                    className="w-full p-3 text-left rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        💵 Day Pass (£10 Cash/Card)
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Paid in person at the track desk
                      </p>
                    </div>
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 group-hover:translate-x-0.5 transition-transform">
                      Select →
                    </span>
                  </button>

                  {/* Option 4: Rental Hour (Wallet Balance) */}
                  {isAdminViewer && localWallet.rentalHours > 0 && (
                    <button
                      onClick={() => {
                        setShowCheckInModal(false);
                        handleCheckInRental(false);
                      }}
                      disabled={isPending}
                      className="w-full p-3 text-left rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                          🏎️ Use Wallet Rental Hour
                        </p>
                        <p className="text-[11px] text-blue-700 dark:text-blue-400">
                          {localWallet.rentalHours} hour{localWallet.rentalHours !== 1 ? "s" : ""} remaining in wallet
                        </p>
                      </div>
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 group-hover:translate-x-0.5 transition-transform">
                        Select →
                      </span>
                    </button>
                  )}

                  {/* Option 5: Car Rental (£10 Cash/Card) */}
                  <button
                    onClick={() => {
                      setShowCheckInModal(false);
                      handleCheckInRental(true);
                    }}
                    disabled={isPending}
                    className="w-full p-3 text-left rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        🏎️ Car Rental (£10 Cash/Card)
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Car rental session paid at desk
                      </p>
                    </div>
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 group-hover:translate-x-0.5 transition-transform">
                      Select →
                    </span>
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => setShowCheckInModal(false)}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revoke Confirmation Inline */}
        {showRevoke && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setShowRevoke(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Revoke Membership</p>
                  <p className="text-xs text-zinc-500">Step {revokeStep} of 2</p>
                </div>
              </div>
              {revokeStep === 1 ? (
                <>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Revoking membership for <strong>{m.name}</strong> will immediately expire their track access.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowRevoke(false)} className="flex-1 py-2 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 hover:bg-zinc-200 transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => setRevokeStep(2)} className="flex-1 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
                      Next →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    Are you sure you want to revoke <strong>{m.name}</strong>'s membership?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setRevokeStep(1)} disabled={isPending} className="py-2 px-4 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 hover:bg-zinc-200 transition-colors">
                      ← Back
                    </button>
                    <button onClick={handleRevoke} disabled={isPending} className="flex-1 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {isPending ? "Revoking..." : "Confirm Revoke"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return null;
}
