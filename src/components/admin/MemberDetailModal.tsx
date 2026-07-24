"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  activateMembership,
  revokeMembership,
  adminAdjustWallet,
} from "@/actions/admin/membership";
import { quickCheckIn } from "@/actions/admin/checkins";
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
  const [overrideDate, setOverrideDate] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeStep, setRevokeStep] = useState<1 | 2>(1);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

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

  function handleCheckIn() {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await quickCheckIn(m.id, m.name, session.user.id);
      if (res.success) {
        onUpdate({ type: "success", message: `${m.name} checked in!` });
      } else {
        onUpdate({ type: "error", message: res.error });
      }
    });
  }

  const viewerRole = session?.user?.role;
  const isAdminViewer = viewerRole === "admin";
  const isModeratorViewer = viewerRole === "moderator";

  return (
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
              <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {m.name}
                {m.nickname && (
                  <span className="ml-1.5 text-amber-600 font-bold text-sm">"{m.nickname}"</span>
                )}
              </p>
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
          {/* Member ID */}
          <div className="text-center">
            <p className="text-[11px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md inline-block border border-zinc-200 dark:border-zinc-700">
              Member ID: {m.id}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
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
          </div>

          {/* Membership Status (Admin Only) */}
          {!isModeratorViewer && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Membership</h3>
              {isAdmin ? (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  Admin Access
                </span>
              ) : localMembership ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={localMembership.status} size="sm" />
                    {membershipActive && (
                      <span className="text-xs text-zinc-500">
                        {getRemainingDays(localMembership.expiresAt)} days remaining
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
                      <span className="text-zinc-400 block">Expires</span>
                      <span className={`font-medium ${membershipActive ? "text-zinc-800 dark:text-zinc-200" : "text-red-600"}`}>
                        {formatDate(localMembership.expiresAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No membership record</p>
              )}

              {/* Membership Actions (Admin Only) */}
              {isAdminViewer && !isAdmin && (
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
                  <button
                    onClick={handleCheckIn}
                    disabled={isPending}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Check In Now
                  </button>
                </div>
              )}
              {/* Date Override Inline (Admin only) */}
              {isAdminViewer && showOverride && (
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
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
                    {isPending ? "..." : "Set"}
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
          )}

          {/* Moderator Track Action */}
          {isModeratorViewer && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Track Actions</h3>
              <button
                onClick={handleCheckIn}
                disabled={isPending}
                className="w-full px-4 py-2.5 text-xs font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                Check In Member Now
              </button>
            </div>
          )}

          {/* Wallet Balances (Admin only) */}
          {!isAdmin && isAdminViewer && (
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
        </div>

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
}
