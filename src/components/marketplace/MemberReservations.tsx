"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelReservation,
  listMembersForReservation,
  reserveForMember,
  type ReservationView,
} from "@/actions/marketplace-reservations";
import { setListingReservedCount, setVariantReservedCount } from "@/actions/marketplace";
import { SheetFrame } from "@/components/admin/desk/desk-ui";

type Member = { id: string; name: string; nickname: string | null; email: string };

export interface ReservableVariant {
  id: string;
  name: string;
  /** Units still free to reserve (not sold, not already held). */
  free: number;
  /** Units held without a named member (legacy holds). */
  anonHeld: number;
}

interface MemberReservationsProps {
  listingId: string;
  hasVariations: boolean;
  variationLabel?: string;
  /** Non-variant: units free to reserve. */
  free: number;
  /** Non-variant: units held without a named member (legacy holds). */
  anonHeld: number;
  variants?: ReservableVariant[];
  reservations: ReservationView[];
}

/**
 * Admin panel: reserve units for a specific member, see who holds what, cancel
 * a hold, and release any older "no member" holds. Admin only (the page only
 * renders it for admins, and every action re-checks on the server).
 */
export function MemberReservations({
  listingId,
  hasVariations,
  variationLabel,
  free,
  anonHeld,
  variants = [],
  reservations,
}: MemberReservationsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalFree = hasVariations ? variants.reduce((s, v) => s + v.free, 0) : free;

  function cancel(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await cancelReservation(id);
      setConfirmId(null);
      if (res.success) router.refresh();
      else setError(res.error);
    });
  }

  function releaseAnon(variantId?: string) {
    setError(null);
    startTransition(async () => {
      const res = variantId
        ? await setVariantReservedCount(listingId, variantId, 0)
        : await setListingReservedCount(listingId, 0);
      if (res.success) router.refresh();
      else setError(res.error);
    });
  }

  const legacy = hasVariations
    ? variants.filter((v) => v.anonHeld > 0).map((v) => ({ key: v.id, label: v.name, qty: v.anonHeld, variantId: v.id }))
    : anonHeld > 0
    ? [{ key: "listing", label: "", qty: anonHeld, variantId: undefined as string | undefined }]
    : [];

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Reservations</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={totalFree <= 0}
          className="min-h-10 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-100 px-3.5 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-40 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          Reserve for a member
        </button>
      </div>

      {reservations.length === 0 && legacy.length === 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Nothing reserved. Reserving links the item to a member so they see it in their orders.
        </p>
      )}

      <ul className="space-y-1.5">
        {reservations.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs dark:bg-amber-500/10">
            <span className="min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">🔖 {r.holderName}</span>
              <span className="text-zinc-600 dark:text-zinc-300">
                {" "}
                × {r.quantity}
                {r.variantName ? ` · ${r.variantName}` : ""}
              </span>
            </span>
            {confirmId === r.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  disabled={pending}
                  className="min-h-8 rounded-md bg-red-600 px-2.5 font-bold text-white disabled:opacity-50"
                >
                  {pending ? "…" : "Cancel it"}
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="min-h-8 rounded-md px-2 font-semibold text-zinc-600 dark:text-zinc-300">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(r.id)}
                className="min-h-8 shrink-0 rounded-md px-2.5 font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Cancel
              </button>
            )}
          </li>
        ))}
        {legacy.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-2 rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs dark:bg-zinc-800">
            <span className="text-zinc-600 dark:text-zinc-300">
              Held without a member{l.label ? ` · ${l.label}` : ""} × {l.qty}
            </span>
            <button
              type="button"
              onClick={() => releaseAnon(l.variantId)}
              disabled={pending}
              className="min-h-8 shrink-0 rounded-md px-2.5 font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Release
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {open && (
        <ReserveSheet
          listingId={listingId}
          hasVariations={hasVariations}
          variationLabel={variationLabel}
          free={free}
          variants={variants}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * A "Reserve for member" button that opens the reserve sheet directly. Admin
 * only; the page decides when to render it. Used under Add to basket on cards
 * and on the listing page.
 */
export function ReserveForMemberButton({
  listingId,
  hasVariations,
  variationLabel,
  free,
  variants = [],
  className,
}: {
  listingId: string;
  hasVariations: boolean;
  variationLabel?: string;
  free: number;
  variants?: ReservableVariant[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const totalFree = hasVariations ? variants.reduce((s, v) => s + v.free, 0) : free;
  const disabled = totalFree <= 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        title={disabled ? "Nothing free to reserve" : undefined}
        className={
          className ??
          "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
        }
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
        </svg>
        Reserve for member
      </button>
      {open && (
        <ReserveSheet
          listingId={listingId}
          hasVariations={hasVariations}
          variationLabel={variationLabel}
          free={free}
          variants={variants}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ReserveSheet({
  listingId,
  hasVariations,
  variationLabel,
  free,
  variants,
  onClose,
  onDone,
}: {
  listingId: string;
  hasVariations: boolean;
  variationLabel?: string;
  free: number;
  variants: ReservableVariant[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const reservable = variants.filter((v) => v.free > 0);
  const [variantId, setVariantId] = useState(reservable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMembersForReservation().then((res) => {
      if (cancelled) return;
      if (res.success) setMembers(res.data);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const max = hasVariations ? reservable.find((v) => v.id === variantId)?.free ?? 0 : free;
  const qty = Math.min(Math.max(1, quantity), Math.max(1, max));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !members) return [];
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.nickname ?? "").toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, query]);

  function submit() {
    if (!member) return;
    setError(null);
    startTransition(async () => {
      const res = await reserveForMember({
        listingId,
        variantId: hasVariations ? variantId : undefined,
        userId: member.id,
        quantity: qty,
      });
      if (res.success) onDone();
      else setError(res.error);
    });
  }

  return (
    <SheetFrame title="Reserve for a member" subtitle="Only you and that member will see who it's reserved for" onClose={onClose}>
      {member ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700/50 dark:bg-emerald-950/30">
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{member.name}</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{member.email}</span>
          </span>
          <button type="button" onClick={() => setMember(null)} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="reserve-member" className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Member
          </label>
          <input
            id="reserve-member"
            autoFocus
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={members ? "Search name, nickname or email" : "Loading members…"}
            disabled={!members}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {loadError && <p className="text-sm font-semibold text-red-600">{loadError}</p>}
          <ul className="space-y-1.5" aria-label="Matching members">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMember(m)}
                  className="flex min-h-12 w-full flex-col justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/60"
                >
                  <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {m.name}
                    {m.nickname ? <span className="font-normal text-amber-600"> “{m.nickname}”</span> : null}
                  </span>
                  <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{m.email}</span>
                </button>
              </li>
            ))}
            {query.trim() && members && matches.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-sm text-zinc-500 dark:border-zinc-700">
                No member matches “{query.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}

      {hasVariations && (
        <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {variationLabel || "Option"}
          <select
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setQuantity(1);
            }}
            className="mt-1 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {reservable.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.free} free)
              </option>
            ))}
          </select>
        </label>
      )}

      <div>
        <span className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Quantity</span>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            aria-label="One fewer"
            onClick={() => setQuantity(Math.max(1, qty - 1))}
            className="h-12 w-12 rounded-xl border border-zinc-300 text-lg font-bold dark:border-zinc-700"
          >
            −
          </button>
          <span className="w-12 text-center text-lg font-black text-zinc-900 dark:text-zinc-100">{qty}</span>
          <button
            type="button"
            aria-label="One more"
            onClick={() => setQuantity(Math.min(max, qty + 1))}
            disabled={qty >= max}
            className="h-12 w-12 rounded-xl border border-zinc-300 text-lg font-bold disabled:opacity-40 dark:border-zinc-700"
          >
            +
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{max} free to reserve</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!member || pending || max < 1}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-amber-500 text-base font-black text-black shadow-md transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Reserving…" : member ? `Reserve ${qty} for ${member.name}` : "Choose a member"}
      </button>
    </SheetFrame>
  );
}
