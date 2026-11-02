"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { statTotal, tierFromStats } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { applyVariant, type EntryVariant } from "@/lib/pack-config";
import {
  createFinishedSetCardAction,
  importMemberCardToPackAction,
  listMemberCarCardsAction,
  type MemberCarOption,
} from "@/actions/admin/driftclash-packs";
import type { SetCard } from "@/components/admin/driftclash/PackEditor";
import { NO_RESTYLE, RestylePanel, type RestyleChoice } from "@/components/admin/driftclash/RestylePanel";
import { variantFrom } from "@/components/admin/driftclash/SavedSetCardPicker";
import {
  StatsModeControl,
  defaultStatsChoice,
  statsChoiceError,
  type StatsChoice,
} from "@/components/admin/driftclash/StatsModeControl";
import { inputCls, labelCls, primaryBtn, secondaryBtn, tierLabel } from "@/components/admin/driftclash/preview";
import type { PackStyle } from "@/lib/pack-styles";

/**
 * Pick a member's car card to use in a pack. Shows every car card members hold, newest first. Choosing one shows its
 * details, with a choice to reroll its stats for the rarity and to restyle it. When it is added, the member's card is
 * saved as a set card ONCE (choosing the same member card again reuses that set card, see importMemberCardToPackAction).
 * The reroll and restyle are kept on the pack entry only, so nothing extra is ever saved.
 */
export function MemberCarPicker({
  tier,
  styles,
  mode = "rarity",
  lockedStyleId,
  onImported,
}: {
  /** The rarity the card is being added to. For the bonus pull this is Legend, the rarity bonus cards are given out as. */
  tier: FullArtTier;
  /** The style library, for restyling the card as it is added. */
  styles: PackStyle[];
  /**
   * "rarity": the card goes on `tier`, so its stats have to fit it (rerolled if they don't).
   * "bonus": the card goes in a bonus pull, which gives every card out as Legend whatever it was saved as, so there
   * is nothing to reroll.
   */
  mode?: "rarity" | "bonus";
  /** A style chosen on the Styles tab: every card picked here starts restyled with it, and the style can't be changed. */
  lockedStyleId?: string;
  onImported: (card: SetCard, variant: EntryVariant | undefined) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [sameRarityOnly, setSameRarityOnly] = useState(false);
  const [cards, setCards] = useState<MemberCarOption[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  /** The search the list on screen was loaded for. It is "loading" whenever this is behind the current search. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<MemberCarOption | null>(null);
  /** What happens to the card's stats on this rarity. Null in a bonus pull, where stats are set when the card is given out. */
  const [statsChoice, setStatsChoice] = useState<StatsChoice | null>(null);
  const [restyle, setRestyle] = useState<RestyleChoice>(NO_RESTYLE);
  /** Whether to save the finished card as a new set card. Null means automatic: ticked once the artwork has been redrawn. */
  const [saveAsNew, setSaveAsNew] = useState<boolean | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  const bonus = mode === "bonus";
  const filterTier = !bonus && sameRarityOnly ? tier : null;
  const key = `${query}|${filterTier ?? "all"}`;
  const loading = loadedKey !== key;
  const latestKey = useRef(key);

  // Wait for a pause in typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // The first page for the current search. A reply for an older search is dropped.
  useEffect(() => {
    latestKey.current = key;
    let cancelled = false;
    listMemberCarCardsAction({ cursor: 0, search: query, tier: filterTier })
      .then((res) => {
        if (cancelled) return;
        setLoadedKey(key);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setError(null);
        setCards(res.data.cards);
        setNextCursor(res.data.nextCursor);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedKey(key);
        setError("Could not load the members' cars");
      });
    return () => {
      cancelled = true;
    };
  }, [key, query, filterTier]);

  async function loadMore() {
    if (nextCursor === null || loadingMore) return;
    const startedKey = key;
    setLoadingMore(true);
    const res = await listMemberCarCardsAction({ cursor: nextCursor, search: query, tier: filterTier }).catch(() => null);
    setLoadingMore(false);
    if (latestKey.current !== startedKey) return;
    if (!res || !res.success) {
      setError(res && !res.success ? res.error : "Could not load more cars");
      return;
    }
    setError(null);
    setCards((list) => [...list, ...res.data.cards.filter((c) => !list.some((x) => x.id === c.id))]);
    setNextCursor(res.data.nextCursor);
  }

  function choose(card: MemberCarOption) {
    setSelected(card);
    setRestyle(lockedStyleId ? { styleId: lockedStyleId, artUrl: null } : NO_RESTYLE);
    setSaveAsNew(null);
    setImportError(null);
    // A card whose stats fit this rarity starts by keeping them; one that doesn't starts rerolled at the pull.
    setStatsChoice(bonus ? null : defaultStatsChoice({ tier: tierFromStats(card.stats), stats: card.stats }, tier));
  }

  const variant = variantFrom(statsChoice, restyle);
  // Saving the finished card only makes sense when it differs from the member's card. After a redraw it starts ticked.
  const changed = Boolean(restyle.styleId) || (statsChoice ? statsChoice.mode !== "keep" : false);
  const willSave = changed && (saveAsNew ?? Boolean(restyle.artUrl));

  function add() {
    if (!selected) return;
    setImportError(null);
    startImport(async () => {
      if (willSave) {
        // The finished card is saved on its own. The member's own card is not saved as well.
        const res = await createFinishedSetCardAction({
          source: { kind: "member", id: selected.id },
          tier: bonus ? tierFromStats(selected.stats) : tier,
          variant,
        });
        if (res.success) onImported(res.data.card as SetCard, res.data.entryVariant);
        else setImportError(res.error);
        return;
      }
      // Saves the member's card as a set card the first time, and returns the same one every time after.
      const res = await importMemberCardToPackAction({ memberCardId: selected.id });
      if (res.success) onImported(res.data as SetCard, variant);
      else setImportError(res.error);
    });
  }

  // ── A card has been chosen ────────────────────────────────────────────────
  if (selected) {
    const drawnAs = tierFromStats(selected.stats);
    const savedAs = { tier: drawnAs, stats: selected.stats };
    const statsError = statsChoice ? statsChoiceError(statsChoice, savedAs, tier) : null;
    const preview = applyVariant(selected, variant, new Map(styles.map((s) => [s.id, s])), tier);

    return (
      <div className="space-y-4">
        <button type="button" className={secondaryBtn} onClick={() => setSelected(null)} disabled={importing}>
          ← Back to members&apos; cars
        </button>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="w-44 shrink-0 self-center sm:self-start">
            <FullArtCard card={preview} showDurability={false} />
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-base font-black">{selected.name}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {selected.owner} · {selected.driver}
                {selected.team ? ` · ${selected.team}` : ""}
              </p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Currently {tierLabel(drawnAs)} · DRIFT {selected.stats.drift} · ACCEL {selected.stats.accel} · GRIP {selected.stats.grip} ·
                STEER {selected.stats.steer} · total {statTotal(selected.stats)}
              </p>
            </div>

            {bonus ? (
              <p className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                In a bonus pull this card is given out as a Legend card with stats of at least 23, so there is no need to reroll its stats. The
                artwork, name, car details and frame come across as they are.
              </p>
            ) : (
              statsChoice && (
                <StatsModeControl
                  tier={tier}
                  saved={savedAs}
                  value={statsChoice}
                  onChange={setStatsChoice}
                  disabled={importing}
                  name="member-stats"
                />
              )
            )}

            <RestylePanel
              styles={styles}
              tier={tier}
              source={{ kind: "member", id: selected.id }}
              choice={restyle}
              onChange={setRestyle}
              disabled={importing}
              lockedStyleId={lockedStyleId}
            />

            {!bonus && drawnAs !== tier && !restyle.artUrl && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                This picture was drawn as a {tierLabel(drawnAs)} card, so its look may not match {tierLabel(tier)}.
                {styles.some((s) => s.prompt.trim()) ? " Redrawing it with an artwork style above can fix that." : ""}
              </p>
            )}

            {changed && (
              <div className="space-y-1 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
                <label className="flex items-start gap-2.5 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={willSave}
                    disabled={importing}
                    onChange={(e) => setSaveAsNew(e.target.checked)}
                  />
                  <span>Save the finished card as a new set card</span>
                </label>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {willSave
                    ? `The card as shown in the preview is saved to Saved set cards (and the Card maker) as its own ${tierLabel(bonus ? drawnAs : tier)} card, and the pack uses that. ${
                        statsChoice?.mode === "reroll" ? "Its stats are rolled once for the saved card; the pack still rerolls them at each pull. " : ""
                      }The member's own card is not saved separately.`
                    : `Leave this off to use the changes in this pack only. The member's car is saved once, as it is (${tierLabel(drawnAs)}), and reused if you pick it again.`}
                </p>
              </div>
            )}
            {!changed && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                The member&apos;s car is saved as a set card, once, and reused if you pick it again.
              </p>
            )}

            <div role="status" aria-live="polite">
              {importError && <p className="text-sm font-bold text-red-600 dark:text-red-400">{importError}</p>}
            </div>

            <button type="button" className={primaryBtn} onClick={add} disabled={importing || Boolean(statsError)}>
              {importing ? "Adding…" : bonus ? "Add to the bonus pull" : `Add to ${tierLabel(tier)}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── The list ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${bonus ? "" : "sm:grid-cols-[1fr_auto]"} sm:items-end`}>
        <div>
          <label htmlFor="mc-search" className={labelCls}>
            Search members&apos; cars
          </label>
          <input
            id="mc-search"
            type="search"
            className={inputCls}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Car, driver, team or member"
            maxLength={60}
          />
        </div>
        {!bonus && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4" checked={sameRarityOnly} onChange={(e) => setSameRarityOnly(e.target.checked)} />
            {tierLabel(tier)} cards only
          </label>
        )}
      </div>

      <div role="status" aria-live="polite">
        {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
        {!error && !loading && cards.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No members&apos; cars match.</p>
        )}
      </div>

      {cards.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => choose(c)}
                aria-label={`Choose ${c.name} by ${c.owner}, ${tierLabel(tierFromStats(c.stats))}`}
                className="w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <FullArtCard card={c} showDurability={false} />
                <span className="mt-1 block truncate text-xs font-bold">{c.name}</span>
                <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {c.owner} · {tierLabel(tierFromStats(c.stats))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        {(loading || loadingMore) && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}
        {!loading && !loadingMore && nextCursor !== null && (
          <button type="button" className={secondaryBtn} onClick={() => void loadMore()}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
