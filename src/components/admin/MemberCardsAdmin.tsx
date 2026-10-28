"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { DeleteCardButton } from "@/components/member-cards/DeleteCardButton";
import { optimizeStoredCardImages, rebuildMemberCardIndex, type AdminMemberCard } from "@/actions/admin/member-cards";
import { ART_STYLES } from "@/lib/card-maker";
import { FULL_ART_TIERS, type FullArtTier } from "@/lib/full-art-card";
import { DEFAULT_SORT_DIRECTION, rarityLabel, sortCards, type CardSortKey, type SortDirection } from "@/lib/card-roll";

/**
 * Admin view of every card members have opened, including ones they re-rolled away (kept as archived
 * copies). Read only: search, filter by rarity and status, sort, and open a card for the large view
 * with its owner.
 */

type SortKey = CardSortKey | "owner";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "driver", label: "Driver" },
  { key: "rarity", label: "Rarity" },
  { key: "owner", label: "Owner" },
];

type StatusFilter = "all" | "active" | "archived";

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const chip = (active: boolean) =>
  `min-h-10 rounded-full border-2 px-4 text-xs font-bold ${
    active
      ? "border-amber-500 bg-amber-500 text-black"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
  }`;

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function statusOf(c: AdminMemberCard): string {
  if (c.archived) return "Re-rolled away";
  if (c.rerolled) return "Re-rolled, final";
  if (c.kept) return "Kept";
  return "Not decided yet";
}

export function MemberCardsAdmin({ initialCards: loadedCards, total: loadedTotal }: { initialCards: AdminMemberCard[]; total: number }) {
  const router = useRouter();
  // Cards deleted from this page disappear straight away, without waiting for a refresh.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [urlOverrides, setUrlOverrides] = useState<Readonly<Record<string, string>>>({});
  const initialCards = useMemo(
    () =>
      loadedCards
        .filter((c) => !removed.has(c.id))
        .map((c) => (urlOverrides[c.imageUrl] ? { ...c, imageUrl: urlOverrides[c.imageUrl] } : c)),
    [loadedCards, removed, urlOverrides]
  );
  const total = Math.max(0, loadedTotal - removed.size);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<FullArtTier | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimizing, setOptimizing] = useState(false);

  const tally = useMemo(() => {
    const counts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, legend: 0, mythic: 0 };
    let archived = 0;
    for (const c of initialCards) {
      if (c.archived) archived++;
      else counts[c.tier] = (counts[c.tier] ?? 0) + 1;
    }
    return { counts, archived };
  }, [initialCards]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = initialCards.filter((c) => {
      if (tier !== "all" && c.tier !== tier) return false;
      if (status === "active" && c.archived) return false;
      if (status === "archived" && !c.archived) return false;
      if (!q) return true;
      return [c.name, c.driver, c.team, c.ability, c.owner, c.ownerEmail].some((v) => v.toLowerCase().includes(q));
    });
    if (sortKey === "owner") {
      const sign = direction === "asc" ? 1 : -1;
      return [...filtered].sort((a, b) => a.owner.localeCompare(b.owner, undefined, { sensitivity: "base" }) * sign || b.createdAt - a.createdAt);
    }
    return sortCards(filtered, sortKey, direction);
  }, [initialCards, query, tier, status, sortKey, direction]);

  const openIndex = openId ? visible.findIndex((c) => c.id === openId) : -1;
  const openCard = openIndex >= 0 ? visible[openIndex] : null;

  function chooseSort(key: SortKey) {
    setSortKey(key);
    setDirection(key === "owner" ? "asc" : DEFAULT_SORT_DIRECTION[key]);
  }

  function rebuild() {
    setNote(null);
    startTransition(async () => {
      const res = await rebuildMemberCardIndex();
      if (res.success) {
        setNote({
          text: `Checked ${res.data.scanned} stored cards. ${res.data.listed} were missing from the list and have been added. The community pool now holds ${res.data.pool} unique driver and car combinations.`,
        });
        router.refresh();
      } else {
        setNote({ text: res.error, error: true });
      }
    });
  }

  async function optimizeImages() {
    if (optimizing) return;
    setOptimizing(true);
    setNote({ text: "Scanning and optimising stored card images to WebP…" });
    let totalImages = 0;
    let totalCards = 0;
    let totalBytesSaved = 0;
    try {
      for (let round = 0; round < 50; round++) {
        const res = await optimizeStoredCardImages();
        if (!res.success) {
          setNote({ text: res.error, error: true });
          return;
        }
        totalImages += res.data.optimizedImages;
        totalCards += res.data.updatedCards;
        totalBytesSaved += res.data.bytesSaved;
        if (Object.keys(res.data.urlMap).length > 0) {
          setUrlOverrides((prev) => ({ ...prev, ...res.data.urlMap }));
        }
        if (res.data.remainingImages <= 0 || res.data.optimizedImages === 0) break;
        const mbSavedSoFar = (totalBytesSaved / (1024 * 1024)).toFixed(1);
        setNote({
          text: `Optimising card images… ${totalImages} converted (${mbSavedSoFar} MB saved), ${res.data.remainingImages} remaining…`,
        });
      }
      if (totalImages === 0) {
        setNote({ text: "All stored card images are already optimised as WebP." });
      } else {
        const mbSaved = (totalBytesSaved / (1024 * 1024)).toFixed(1);
        setNote({
          text: `Optimised ${totalImages} card image${totalImages === 1 ? "" : "s"} across ${totalCards} stored card${totalCards === 1 ? "" : "s"} and resaved as WebP (saved ${mbSaved} MB).`,
        });
        router.refresh();
      }
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Could not optimise card images", error: true });
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className={`${panel} space-y-3`} aria-label="Summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Stored cards</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{total}</p>
            {total > initialCards.length && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing the newest {initialCards.length}.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={optimizeImages}
              disabled={pending || optimizing}
              className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-black text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {optimizing ? "Optimising images…" : "Optimise card images"}
            </button>
            <button
              type="button"
              onClick={rebuild}
              disabled={pending || optimizing}
              className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {pending ? "Checking…" : "Find missing cards"}
            </button>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Cards by rarity">
          {[...FULL_ART_TIERS].reverse().map((t) => (
            <li key={t.id} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <span className="block text-xs font-black text-zinc-900 dark:text-zinc-100">{t.label}</span>
              <span className="block text-lg font-black text-zinc-900 dark:text-zinc-100">{tally.counts[t.id]}</span>
            </li>
          ))}
          <li className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <span className="block text-xs font-black text-zinc-900 dark:text-zinc-100">Re-rolled away</span>
            <span className="block text-lg font-black text-zinc-900 dark:text-zinc-100">{tally.archived}</span>
          </li>
        </ul>
        {note && (
          <p
            role={note.error ? "alert" : "status"}
            className={`rounded-lg border p-2.5 text-xs font-bold ${
              note.error
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {note.text}
          </p>
        )}
      </section>

      {/* Filters */}
      <section className="space-y-3" aria-label="Filters">
        <div>
          <label htmlFor="mc-search" className="sr-only">
            Search cards
          </label>
          <input
            id="mc-search"
            type="search"
            className={inputClass}
            placeholder="Search by name, driver, team, chassis or member"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rarity">
          <button type="button" aria-pressed={tier === "all"} onClick={() => setTier("all")} className={chip(tier === "all")}>
            All rarities
          </button>
          {[...FULL_ART_TIERS].reverse().map((t) => (
            <button key={t.id} type="button" aria-pressed={tier === t.id} onClick={() => setTier(t.id)} className={chip(tier === t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Status">
          {(
            [
              ["all", "All cards"],
              ["active", "In collections"],
              ["archived", "Re-rolled away"],
            ] as const
          ).map(([key, text]) => (
            <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={chip(status === key)}>
              {text}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort cards by">
            {SORTS.map((s) => (
              <button key={s.key} type="button" aria-pressed={sortKey === s.key} onClick={() => chooseSort(s.key)} className={chip(sortKey === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort order: ${direction === "asc" ? "ascending" : "descending"}. Tap to reverse.`}
            className="min-h-10 rounded-xl border border-zinc-300 px-4 text-xs font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {direction === "asc" ? "A → Z / low → high" : "Z → A / high → low"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status">
          Showing {visible.length} of {initialCards.length} loaded cards.
        </p>
      </section>

      {initialCards.length === 0 ? (
        <section className={`${panel} py-10 text-center`}>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">No cards stored yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Cards appear here as members open packs. If members already opened cards before this page existed, use &ldquo;Find missing
            cards&rdquo; above.
          </p>
        </section>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No cards match those filters.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Stored cards">
          {visible.map((c) => (
            <li key={c.id} className="space-y-2">
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="block w-full rounded-2xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
                aria-label={`View ${c.name}, ${rarityLabel(c.tier)} card, ${c.owner}`}
              >
                <FullArtCard card={c} className={`drop-shadow-lg ${c.archived ? "opacity-60" : ""}`} />
              </button>
              <div className="text-center text-xs">
                <p className="truncate font-bold text-zinc-800 dark:text-zinc-100">{c.owner}</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {rarityLabel(c.tier)} · {statusOf(c)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Viewer
        card={openCard}
        index={openIndex}
        total={visible.length}
        onClose={() => setOpenId(null)}
        onMove={(step) => {
          const next = visible[openIndex + step];
          if (next) setOpenId(next.id);
        }}
        onDeleted={(id) => {
          setRemoved((set) => new Set(set).add(id));
          setOpenId(null);
        }}
      />
    </div>
  );
}

/** Large read-only view of one card with its owner, in a native dialog (focus stays inside, Escape closes). */
function Viewer({
  card,
  index,
  total,
  onClose,
  onMove,
  onDeleted,
}: {
  card: AdminMemberCard | null;
  index: number;
  total: number;
  onClose: () => void;
  onMove: (step: -1 | 1) => void;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (card && !dialog.open) dialog.showModal();
    if (!card && dialog.open) dialog.close();
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onMove(-1);
      if (e.key === "ArrowRight") onMove(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onMove]);

  const styles = card ? card.styleIds.map((id) => ART_STYLES.find((s) => s.id === id)?.label).filter(Boolean) : [];
  const btn = "min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="admin-card-title"
      className="m-auto w-[min(60rem,94vw)] max-h-[94vh] overflow-y-auto rounded-3xl border border-amber-500/30 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      {card && (
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="mx-auto w-full max-w-[22rem]">
            <FullArtCard card={card} className="drop-shadow-2xl" />
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  {rarityLabel(card.tier)} card · {statusOf(card)}
                </p>
                <h2 id="admin-card-title" className="text-2xl font-black">
                  {card.name}
                </h2>
              </div>
              <button type="button" onClick={onClose} className={btn}>
                Close
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-bold text-zinc-400">Member</dt>
              <dd>{card.owner}</dd>
              <dt className="font-bold text-zinc-400">Email</dt>
              <dd className="break-all">{card.ownerEmail || "—"}</dd>
              <dt className="font-bold text-zinc-400">Driver</dt>
              <dd>{card.driver || "—"}</dd>
              <dt className="font-bold text-zinc-400">Team</dt>
              <dd>{card.team || "—"}</dd>
              <dt className="font-bold text-zinc-400">Chassis</dt>
              <dd>{card.ability || "—"}</dd>
              <dt className="font-bold text-zinc-400">About</dt>
              <dd>{card.effect || "—"}</dd>
              <dt className="font-bold text-zinc-400">Stats</dt>
              <dd>
                Drift {card.stats.drift} · Accel {card.stats.accel} · Grip {card.stats.grip} · Steer {card.stats.steer}
              </dd>
              <dt className="font-bold text-zinc-400">Art style</dt>
              <dd>{styles.length > 0 ? styles.join(" + ") : "Tier default"}</dd>
              <dt className="font-bold text-zinc-400">Opened</dt>
              <dd>{formatDate(card.createdAt)}</dd>
              <dt className="font-bold text-zinc-400">Card id</dt>
              <dd className="break-all font-mono text-xs text-zinc-400">{card.id}</dd>
            </dl>
            <a href={card.imageUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-bold text-amber-400 underline">
              Open the artwork
            </a>
            <DeleteCardButton key={card.id} cardId={card.id} onDeleted={onDeleted} />
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" className={btn} onClick={() => onMove(-1)} disabled={index <= 0}>
                ← Previous
              </button>
              <span className="text-xs text-zinc-400">
                {index + 1} of {total}
              </span>
              <button type="button" className={btn} onClick={() => onMove(1)} disabled={index >= total - 1}>
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
