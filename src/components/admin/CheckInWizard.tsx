"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MemberWithMembership } from "@/actions/admin/members";
import {
  quickCheckIn,
  checkInWithDayPass,
  checkInWithRental,
  addNonMemberCheckIn,
} from "@/actions/admin/checkins";
import { activateMembershipInPerson } from "@/actions/membership";

type Step = "account" | "pickMember" | "guest" | "options" | "success";

export function CheckInWizard({ members }: { members: MemberWithMembership[] }) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Auto-open when navigated here with ?open=1 (e.g. from the command center),
  // then strip the param so a refresh or back-nav doesn't reopen it.
  useEffect(() => {
    if (searchParams.get("open") === "1") {
      setOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-6 px-6 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black text-xl sm:text-2xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.99] border border-green-500/40"
      >
        <span className="text-3xl">✅</span> Check Customer In
      </button>

      {open && <WizardModal members={members} onClose={() => setOpen(false)} />}
    </>
  );
}

function WizardModal({
  members,
  onClose,
}: {
  members: MemberWithMembership[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const adminId = session?.user?.id;

  const [step, setStep] = useState<Step>("account");
  const [selected, setSelected] = useState<MemberWithMembership | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [guestName, setGuestName] = useState("");
  const [guestMethod, setGuestMethod] = useState<"manual" | "day_pass" | "rental">("day_pass");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Auto-close a few seconds after a successful check-in, refreshing the
  // "Checked in today" list so the new name appears.
  useEffect(() => {
    if (step !== "success") return;
    const t = setTimeout(() => {
      router.refresh();
      onClose();
    }, 2500);
    return () => clearTimeout(t);
  }, [step, router, onClose]);

  // Reset the visible window whenever the search changes.
  useEffect(() => {
    setVisibleCount(50);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? members.filter(
          (m) =>
            m.member.name.toLowerCase().includes(q) ||
            (m.member.nickname || "").toLowerCase().includes(q) ||
            m.member.email.toLowerCase().includes(q)
        )
      : members;
    // Free-access first (staff or active membership), then alphabetical
    // (list is already alpha-sorted).
    const rank = (m: MemberWithMembership) => {
      const staff = m.member.role === "admin" || m.member.role === "moderator";
      const active = m.membership?.status === "active";
      return staff || active ? 0 : 1;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [members, query]);

  function finish(message: string) {
    setSuccessMsg(message);
    setStep("success");
    router.refresh();
  }

  function fail(message?: string) {
    setError(message || "Something went wrong");
  }

  // ── Check-in handlers (mirror the members-modal call patterns) ──────────
  function checkInMembership(m: MemberWithMembership) {
    if (!adminId) return;
    setError(null);
    startTransition(async () => {
      const res = await quickCheckIn(m.member.id, m.member.name, adminId, "membership");
      if (res.success) finish(`${m.member.name} checked in with membership! 🟢`);
      else fail(res.error);
    });
  }

  function activateAndCheckIn(m: MemberWithMembership) {
    if (!adminId) return;
    setError(null);
    startTransition(async () => {
      const res = await activateMembershipInPerson(m.member.id, m.member.name, adminId);
      if (res.success) finish(res.data.message);
      else fail(res.error);
    });
  }

  function checkInDayPass(m: MemberWithMembership, isPaidInPerson: boolean) {
    if (!adminId) return;
    setError(null);
    startTransition(async () => {
      const res = await checkInWithDayPass(m.member.id, m.member.name, adminId, isPaidInPerson);
      if (res.success)
        finish(
          `${m.member.name} checked in with Day Pass ${isPaidInPerson ? "(£10 Paid)" : "(Wallet)"} 🎫`
        );
      else fail(res.error);
    });
  }

  function checkInRental(m: MemberWithMembership, isPaidInPerson: boolean) {
    if (!adminId) return;
    setError(null);
    startTransition(async () => {
      const res = await checkInWithRental(m.member.id, m.member.name, adminId, isPaidInPerson);
      if (res.success)
        finish(
          `${m.member.name} checked in with Car Rental ${isPaidInPerson ? "(£10 Paid)" : "(Wallet)"} 🏎️`
        );
      else fail(res.error);
    });
  }

  function checkInGuest() {
    if (!adminId) return;
    const name = guestName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await addNonMemberCheckIn(name, adminId, guestMethod);
      if (res.success) finish(`${name} checked in! ✅`);
      else fail(res.error);
    });
  }

  const modal = (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md mx-auto flex flex-col max-h-[85vh] max-h-[85dvh] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
            {step === "success" ? "Checked In!" : "Check Customer In"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 flex flex-col">
          {error && (
            <p className="text-sm font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </p>
          )}

          {/* ── Step: account? ─────────────────────────────────────────── */}
          {step === "account" && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Does this customer have an account?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStep("pickMember")}
                  className="p-5 rounded-xl border border-green-200 dark:border-green-800/60 bg-green-50/60 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors text-center"
                >
                  <div className="text-2xl mb-1">👤</div>
                  <div className="text-sm font-black text-green-800 dark:text-green-300">Yes</div>
                  <div className="text-[11px] text-green-600 dark:text-green-400">Select their account</div>
                </button>
                <button
                  onClick={() => setStep("guest")}
                  className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors text-center"
                >
                  <div className="text-2xl mb-1">🎫</div>
                  <div className="text-sm font-black text-zinc-900 dark:text-zinc-100">No</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Guest / walk-in</div>
                </button>
              </div>
            </div>
          )}

          {/* ── Step: pick member ──────────────────────────────────────── */}
          {step === "pickMember" && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              {/* Pinned search */}
              <div className="shrink-0 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                  🔍
                </span>
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, nickname or email..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-9 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Scrolling member list — the only scroll region in this step */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {filtered.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-6 text-center">No members found.</p>
                ) : (
                  <>
                    {filtered.slice(0, visibleCount).map((m) => {
                      const active = m.membership?.status === "active";
                      const staff = m.member.role === "admin" || m.member.role === "moderator";
                      return (
                        <button
                          key={m.member.id}
                          onClick={() => {
                            setSelected(m);
                            setStep("options");
                          }}
                          className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            {m.member.image ? (
                              <img src={m.member.image} alt={m.member.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 font-black text-xs shrink-0">
                                {m.member.name[0]?.toUpperCase()}
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                {m.member.name}
                              </span>
                              {m.member.nickname && (
                                <span className="block text-[11px] text-amber-600 truncate">
                                  &quot;{m.member.nickname}&quot;
                                </span>
                              )}
                            </span>
                          </span>
                          {staff ? (
                            <span className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              {m.member.role === "admin" ? "Admin" : "Mod"}
                            </span>
                          ) : active ? (
                            <span className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                              Member
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {filtered.length > visibleCount && (
                      <button
                        onClick={() => setVisibleCount((c) => c + 50)}
                        className="w-full py-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        Show more ({filtered.length - visibleCount} more)
                      </button>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={() => setStep("account")}
                className="shrink-0 w-full py-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

          {/* ── Step: options for a selected member ────────────────────── */}
          {step === "options" && selected && (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              <MemberOptions
                m={selected}
                isPending={isPending}
                onMembership={() => checkInMembership(selected)}
                onActivate={() => activateAndCheckIn(selected)}
                onDayPassWallet={() => checkInDayPass(selected, false)}
                onDayPassCash={() => checkInDayPass(selected, true)}
                onRentalWallet={() => checkInRental(selected, false)}
                onRentalCash={() => checkInRental(selected, true)}
                onBack={() => {
                  setSelected(null);
                  setStep("pickMember");
                }}
              />
            </div>
          )}

          {/* ── Step: guest ────────────────────────────────────────────── */}
          {step === "guest" && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <input
                autoFocus
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Customer name..."
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <div className="space-y-1.5">
                {(
                  [
                    { v: "day_pass", label: "💵 Day Pass (£10 Cash/Card)" },
                    { v: "rental", label: "🏎️ Car Rental (£10 Cash/Card)" },
                    { v: "manual", label: "🟢 Track Access (no charge)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setGuestMethod(opt.v)}
                    className={`w-full p-3 text-left rounded-xl border text-sm font-bold transition-colors ${
                      guestMethod === opt.v
                        ? "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300"
                        : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep("account")}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={checkInGuest}
                  disabled={!guestName.trim() || isPending}
                  className="flex-1 py-2.5 text-sm font-black rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-md transition-colors disabled:opacity-50"
                >
                  {isPending ? "Checking in..." : "Check In ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: success ──────────────────────────────────────────── */}
          {step === "success" && (
            <div className="py-6 text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/60 border border-green-200 dark:border-green-800 flex items-center justify-center text-3xl">
                ✅
              </div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 px-2">{successMsg}</p>
              <p className="text-[11px] text-zinc-400">Closing…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function MemberOptions({
  m,
  isPending,
  onMembership,
  onActivate,
  onDayPassWallet,
  onDayPassCash,
  onRentalWallet,
  onRentalCash,
  onBack,
}: {
  m: MemberWithMembership;
  isPending: boolean;
  onMembership: () => void;
  onActivate: () => void;
  onDayPassWallet: () => void;
  onDayPassCash: () => void;
  onRentalWallet: () => void;
  onRentalCash: () => void;
  onBack: () => void;
}) {
  const active = m.membership?.status === "active";
  // Admins and moderators are staff and get free track access regardless of
  // whether they hold a paid membership.
  const isStaff = m.member.role === "admin" || m.member.role === "moderator";
  const hasFreeAccess = active || isStaff;
  const dayPasses = m.wallet.dayPasses;
  const rentalHours = m.wallet.rentalHours;

  const staffLabel = m.member.role === "admin" ? "Admin" : "Moderator";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5 pb-1">
        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{m.member.name}</span>
        {isStaff ? (
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            {staffLabel}
          </span>
        ) : active ? (
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            Active Member
          </span>
        ) : null}
      </div>

      {/* Prominent: active paid membership OR staff -> free track access */}
      {hasFreeAccess && (
        <button
          onClick={onMembership}
          disabled={isPending}
          className="w-full p-4 text-left rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center justify-between disabled:opacity-50"
        >
          <div>
            <p className="text-sm font-black text-green-800 dark:text-green-300">🟢 Membership Track Access</p>
            <p className="text-[11px] text-green-600 dark:text-green-400">
              {isStaff
                ? `Free — ${staffLabel.toLowerCase()} staff access`
                : "Free — active 28-day membership"}
            </p>
          </div>
          <span className="text-xs font-black text-green-700 dark:text-green-300">Check In →</span>
        </button>
      )}

      {/* 28-day membership (£40 cash/card) */}
      <OptionRow
        onClick={onActivate}
        disabled={isPending}
        title="💳 28-Day Membership (£40 Cash/Card)"
        subtitle="Activate membership & check in for today"
        tone="purple"
      />

      {/* Wallet day pass */}
      {dayPasses > 0 && (
        <OptionRow
          onClick={onDayPassWallet}
          disabled={isPending}
          title="🎫 Use Wallet Day Pass"
          subtitle={`${dayPasses} pass${dayPasses !== 1 ? "es" : ""} in wallet`}
          tone="amber"
        />
      )}

      {/* Day pass £10 cash */}
      <OptionRow
        onClick={onDayPassCash}
        disabled={isPending}
        title="💵 Day Pass (£10 Cash/Card)"
        subtitle="Paid in person at the desk"
        tone="plain"
      />

      {/* Wallet rental */}
      {rentalHours > 0 && (
        <OptionRow
          onClick={onRentalWallet}
          disabled={isPending}
          title="🏎️ Use Wallet Rental Hour"
          subtitle={`${rentalHours} hour${rentalHours !== 1 ? "s" : ""} in wallet`}
          tone="blue"
        />
      )}

      {/* Rental £10 cash */}
      <OptionRow
        onClick={onRentalCash}
        disabled={isPending}
        title="🏎️ Car Rental (£10 Cash/Card)"
        subtitle="Car rental session paid at desk"
        tone="plain"
      />

      <button
        onClick={onBack}
        disabled={isPending}
        className="w-full py-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        ← Back to members
      </button>
    </div>
  );
}

function OptionRow({
  onClick,
  disabled,
  title,
  subtitle,
  tone,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  subtitle: string;
  tone: "purple" | "amber" | "blue" | "plain";
}) {
  const toneMap = {
    purple:
      "border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40",
    amber:
      "border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    blue:
      "border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40",
    plain:
      "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/60",
  } as const;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-3 text-left rounded-xl border transition-colors flex items-center justify-between disabled:opacity-50 ${toneMap[tone]}`}
    >
      <div>
        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Select →</span>
    </button>
  );
}
