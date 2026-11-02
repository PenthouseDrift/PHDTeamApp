"use client";

import { useEffect, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import ImageUploader from "@/components/ui/ImageUploader";
import type { FullArtTier } from "@/lib/full-art-card";
import { FRAME_EFFECTS } from "@/lib/full-art-card";
import { applyVariant, type CardEdits, type EntryVariant } from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import { statFieldsOf, statsChoiceError, statsChoiceOf, type StatsChoice } from "@/lib/stats-choice";
import { adoptPictureAction, listMemberCarCardsAction, type MemberCarOption } from "@/actions/admin/driftclash-packs";
import type { SetCard } from "@/components/admin/driftclash/PackEditor";
import { NO_RESTYLE, RestylePanel, type RestyleChoice } from "@/components/admin/driftclash/RestylePanel";
import { StatsModeControl } from "@/components/admin/driftclash/StatsModeControl";
import { Modal, dangerBtn, inputCls, labelCls, primaryBtn, secondaryBtn, tierLabel } from "@/components/admin/driftclash/preview";

const TEXT_FIELDS = [
  ["name", "Name on the card", 40],
  ["ability", "Chassis", 48],
  ["driver", "Driver", 30],
  ["team", "Team", 30],
  ["effect", "Description", 160],
] as const;

const COLOUR_FIELDS = [
  ["customBorderColor", "Border"],
  ["customStatLabelColor", "Stat labels"],
  ["customStatValueColor", "Stat numbers"],
  ["customBottomBarBgColor", "Bottom bar"],
  ["customBottomBarBorderColor", "Bottom bar edge"],
] as const;
type ColourKey = (typeof COLOUR_FIELDS)[number][0];

/** Same test the server applies, so a colour that would be dropped is caught here. */
const COLOUR_OK = /^[#a-zA-Z0-9(),.%\s-]{3,40}$/;
const HEX_OK = /^#[0-9a-f]{6}$/i;

type Frame = {
  colours: Record<ColourKey, string>;
  effect: "" | "none" | "flames" | "prismatic";
  shine: "" | "on" | "off";
  flame: string;
};

function frameOf(card: { [K in ColourKey]?: string } & { customFrameEffect?: string; customFrameShine?: boolean; customFlameColor?: string }): Frame {
  const colours = {} as Record<ColourKey, string>;
  for (const [key] of COLOUR_FIELDS) colours[key] = card[key] ?? "";
  return {
    colours,
    effect: (card.customFrameEffect as Frame["effect"]) ?? "",
    shine: card.customFrameShine === undefined ? "" : card.customFrameShine ? "on" : "off",
    flame: card.customFlameColor ?? "",
  };
}

/**
 * Edit a set card as one pack uses it: the words on it, its picture (keep it, upload one, take a member's car, or redraw it in
 * a style), the style and colours of its frame, and its stats. Everything is kept on the pack entry, so the saved card is not
 * changed. "Save as a new set card" turns the result into a card of its own. Nothing is applied until you choose one of them.
 */
export function EntryEditorDialog({
  mode,
  tier,
  saved,
  variant,
  styles,
  onApply,
  onSaveAsNew,
  onClose,
}: {
  /** "rarity": a card on a rarity, with a stats choice. "bonus": a bonus pull card, whose stats are set when it is given out. */
  mode: "rarity" | "bonus";
  /** The rarity it is on (Legend for the bonus pull). */
  tier: FullArtTier;
  /** The card as saved. */
  saved: SetCard;
  /** What this pack already changes about it. */
  variant: EntryVariant | undefined;
  styles: PackStyle[];
  onApply: (variant: EntryVariant | undefined) => void;
  /** Save the result as a new set card. Resolves to an error message, or null when it worked (the caller closes the dialog). */
  onSaveAsNew: (variant: EntryVariant | undefined) => Promise<string | null>;
  onClose: () => void;
}) {
  const bonus = mode === "bonus";
  const styleMap = new Map(styles.map((s) => [s.id, s]));
  const current = applyVariant(saved, variant, styleMap, tier);

  const [texts, setTexts] = useState(() => ({
    name: current.name,
    ability: current.ability,
    effect: current.effect,
    driver: current.driver,
    team: current.team,
  }));
  const [position, setPosition] = useState(() => ({ zoom: current.imageZoom, x: current.imageX, y: current.imageY }));
  const [frame, setFrame] = useState<Frame>(() => frameOf(current));
  /** The style, and the redrawn picture if there is one. */
  const [restyle, setRestyle] = useState<RestyleChoice>({ styleId: variant?.styleId ?? null, artUrl: null });
  /** A picture the admin brought in (uploaded, or a member's car), kept in the set cards' file area. */
  const [sourcePicture, setSourcePicture] = useState<string | null>(variant?.artUrl ?? null);
  const [statsChoice, setStatsChoice] = useState<StatsChoice | null>(() => (bonus ? null : statsChoiceOf(variant, saved, tier)));
  const [uploaderKey, setUploaderKey] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adopting, startAdopt] = useTransition();
  const [saving, startSave] = useTransition();

  // The card with the chosen style's frame but none of the edits: what each field is compared with.
  const baseFor = (styleId: string | null) => applyVariant(saved, styleId ? { styleId } : undefined, styleMap);
  const base = baseFor(restyle.styleId);
  const pictureNow = restyle.artUrl ?? sourcePicture ?? undefined;

  /** The variant these choices make, or an error that stops it being used. */
  function build(): { variant: EntryVariant | undefined; error: string | null } {
    const edits: CardEdits = {};
    for (const [key] of TEXT_FIELDS) {
      const value = texts[key].replace(/\s+/g, " ").trim();
      if (key === "name" && !value) return { variant: undefined, error: "The card needs a name." };
      if (value !== base[key]) edits[key] = value;
    }
    if (position.zoom !== base.imageZoom) edits.imageZoom = position.zoom;
    if (position.x !== base.imageX) edits.imageX = position.x;
    if (position.y !== base.imageY) edits.imageY = position.y;

    for (const [key, label] of COLOUR_FIELDS) {
      const value = frame.colours[key].trim();
      if (!value) continue;
      if (!COLOUR_OK.test(value)) return { variant: undefined, error: `${label} isn't a colour I can use. Try something like #ff8800.` };
      if (value !== (base[key] ?? "")) edits[key] = value;
    }
    if (frame.effect && frame.effect !== (base.customFrameEffect ?? "")) edits.customFrameEffect = frame.effect;
    if (frame.shine) {
      const shine = frame.shine === "on";
      if (shine !== base.customFrameShine) edits.customFrameShine = shine;
    }
    if (frame.flame.trim()) {
      if (!HEX_OK.test(frame.flame.trim())) return { variant: undefined, error: "The flame colour must be like #ff8800." };
      if (frame.flame.trim().toLowerCase() !== (base.customFlameColor ?? "")) edits.customFlameColor = frame.flame.trim().toLowerCase();
    }

    if (statsChoice) {
      const statsError = statsChoiceError(statsChoice, saved, tier);
      if (statsError) return { variant: undefined, error: statsError };
    }

    const built: EntryVariant = {
      ...(restyle.styleId ? { styleId: restyle.styleId } : {}),
      ...(pictureNow ? { artUrl: pictureNow } : {}),
      ...(Object.keys(edits).length > 0 ? { edits } : {}),
      ...statFieldsOf(statsChoice),
    };
    return { variant: Object.keys(built).length > 0 ? built : undefined, error: null };
  }

  const built = build();
  const preview = applyVariant(saved, built.variant, styleMap, tier);

  function changeRestyle(next: RestyleChoice) {
    // A new style brings its own frame, so the colour boxes start from that.
    if (next.styleId !== restyle.styleId) setFrame(frameOf(baseFor(next.styleId)));
    setRestyle(next);
  }

  function adopt(url: string) {
    setMessage(null);
    startAdopt(async () => {
      const res = await adoptPictureAction({ url });
      if (res.success) {
        setSourcePicture(res.data.imageUrl);
        setRestyle((r) => ({ ...r, artUrl: null }));
        setShowMembers(false);
      } else setMessage(res.error);
    });
  }

  function reset() {
    setTexts({ name: saved.name, ability: saved.ability, effect: saved.effect, driver: saved.driver, team: saved.team });
    setPosition({ zoom: saved.imageZoom, x: saved.imageX, y: saved.imageY });
    setFrame(frameOf(saved));
    setRestyle(NO_RESTYLE);
    setSourcePicture(null);
    setStatsChoice(bonus ? null : statsChoiceOf(undefined, saved, tier));
    setUploaderKey((k) => k + 1);
    setMessage(null);
  }

  function saveAsNew() {
    if (built.error) return setMessage(built.error);
    setMessage(null);
    startSave(async () => {
      const error = await onSaveAsNew(built.variant);
      if (error) setMessage(error);
    });
  }

  const busy = adopting || saving;
  const setText = (key: (typeof TEXT_FIELDS)[number][0]) => (e: React.ChangeEvent<HTMLInputElement>) => setTexts((t) => ({ ...t, [key]: e.target.value }));

  return (
    <Modal title={`Edit ${saved.name} on ${bonus ? "the bonus pull" : tierLabel(tier)}`} onClose={onClose}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-44 shrink-0 self-center sm:sticky sm:top-0 sm:self-start">
          <FullArtCard card={preview} showDurability={false} />
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {bonus ? "Shown as saved. Bonus cards are given out as Legend." : variant?.rerollOnPull || statsChoice?.mode === "reroll" ? "Stats are rolled at each pull." : ""}
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <details open className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-black">Words on the card</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {TEXT_FIELDS.map(([key, label, max]) => (
                <div key={key} className={key === "effect" ? "sm:col-span-2" : ""}>
                  <label htmlFor={`ee-${key}`} className={labelCls}>
                    {label}
                  </label>
                  <input id={`ee-${key}`} className={inputCls} value={texts[key]} maxLength={max} onChange={setText(key)} />
                </div>
              ))}
            </div>
          </details>

          <details open className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-black">Picture</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {pictureNow ? "This pack uses a different picture from the saved card." : "This pack uses the saved card's picture."}
              </p>
              <ImageUploader
                key={uploaderKey}
                maxFiles={1}
                label="Pack card picture"
                onUploadComplete={(urls) => {
                  if (urls[0]) adopt(urls[0]);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setShowMembers((s) => !s)}>
                  {showMembers ? "Hide members' cars" : "Use a member's car picture"}
                </button>
                {(sourcePicture || restyle.artUrl) && (
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={busy}
                    onClick={() => {
                      setSourcePicture(null);
                      setRestyle((r) => ({ ...r, artUrl: null }));
                      setUploaderKey((k) => k + 1);
                    }}
                  >
                    Back to the saved card&apos;s picture
                  </button>
                )}
                {adopting && <span className="self-center text-xs text-zinc-500">Getting the picture…</span>}
              </div>
              {showMembers && <MemberPicturePicker disabled={busy} onPick={adopt} />}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ee-zoom" className={labelCls}>
                    Zoom
                  </label>
                  <input
                    id="ee-zoom"
                    type="number"
                    min={100}
                    max={300}
                    className={inputCls}
                    value={position.zoom}
                    onChange={(e) => setPosition((p) => ({ ...p, zoom: Number(e.target.value) || 100 }))}
                  />
                </div>
                <div>
                  <label htmlFor="ee-x" className={labelCls}>
                    Left / right
                  </label>
                  <input
                    id="ee-x"
                    type="number"
                    min={0}
                    max={100}
                    className={inputCls}
                    value={position.x}
                    onChange={(e) => setPosition((p) => ({ ...p, x: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
                  />
                </div>
                <div>
                  <label htmlFor="ee-y" className={labelCls}>
                    Up / down
                  </label>
                  <input
                    id="ee-y"
                    type="number"
                    min={0}
                    max={100}
                    className={inputCls}
                    value={position.y}
                    onChange={(e) => setPosition((p) => ({ ...p, y: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
                  />
                </div>
              </div>
            </div>
          </details>

          <details open className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-black">Style, colours and frame</summary>
            <div className="mt-3 space-y-3">
              <RestylePanel
                styles={styles}
                tier={tier}
                source={{ kind: "upload", url: sourcePicture ?? saved.imageUrl }}
                choice={restyle}
                onChange={changeRestyle}
                disabled={busy}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {COLOUR_FIELDS.map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`ee-${key}`} className={labelCls}>
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`ee-${key}`}
                        className={inputCls}
                        value={frame.colours[key]}
                        placeholder="Default"
                        maxLength={40}
                        onChange={(e) => setFrame((f) => ({ ...f, colours: { ...f.colours, [key]: e.target.value } }))}
                      />
                      <input
                        type="color"
                        aria-label={`Pick ${label} colour`}
                        className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700"
                        value={HEX_OK.test(frame.colours[key]) ? frame.colours[key] : "#888888"}
                        onChange={(e) => setFrame((f) => ({ ...f, colours: { ...f.colours, [key]: e.target.value } }))}
                      />
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => setFrame((f) => ({ ...f, colours: { ...f.colours, [key]: base[key] ?? "" } }))}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <label htmlFor="ee-effect" className={labelCls}>
                    Frame effect
                  </label>
                  <select
                    id="ee-effect"
                    className={inputCls}
                    value={frame.effect}
                    onChange={(e) => setFrame((f) => ({ ...f, effect: e.target.value as Frame["effect"] }))}
                  >
                    <option value="">Default for the card</option>
                    {FRAME_EFFECTS.map((effect) => (
                      <option key={effect} value={effect}>
                        {effect === "none" ? "No effect" : effect === "flames" ? "Flames" : "Prismatic"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ee-shine" className={labelCls}>
                    Glint and sparkles
                  </label>
                  <select
                    id="ee-shine"
                    className={inputCls}
                    value={frame.shine}
                    onChange={(e) => setFrame((f) => ({ ...f, shine: e.target.value as Frame["shine"] }))}
                  >
                    <option value="">Default for the card</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ee-flame" className={labelCls}>
                    Flame colour
                  </label>
                  <input
                    id="ee-flame"
                    className={inputCls}
                    value={frame.flame}
                    placeholder="#ff8800 (default fire)"
                    maxLength={7}
                    onChange={(e) => setFrame((f) => ({ ...f, flame: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </details>

          {statsChoice && (
            <details open className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <summary className="cursor-pointer text-sm font-black">Stats</summary>
              <div className="mt-3">
                <StatsModeControl tier={tier} saved={saved} value={statsChoice} onChange={setStatsChoice} disabled={busy} name="entry-editor-stats" />
              </div>
            </details>
          )}

          <div role="status" aria-live="polite">
            {(message || built.error) && <p className="text-sm font-bold text-red-600 dark:text-red-400">{message ?? built.error}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <button type="button" className={primaryBtn} disabled={busy || Boolean(built.error)} onClick={() => onApply(built.variant)}>
              Apply to this pack
            </button>
            <button type="button" className={secondaryBtn} disabled={busy || Boolean(built.error)} onClick={saveAsNew}>
              {saving ? "Saving…" : "Save as a new set card"}
            </button>
            <button type="button" className={dangerBtn} disabled={busy} onClick={reset}>
              Reset changes
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Apply keeps these changes on this pack only; the saved card is not changed. Save as a new set card makes the result a card of its own in
            Saved set cards.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** A small search over members' cars; choosing one uses its picture. */
function MemberPicturePicker({ disabled, onPick }: { disabled: boolean; onPick: (url: string) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ query: string; cards: MemberCarOption[]; error?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    listMemberCarCardsAction({ cursor: 0, search: query, tier: null })
      .then((res) => {
        if (cancelled) return;
        setLoaded(res.success ? { query, cards: res.data.cards } : { query, cards: [], error: res.error });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ query, cards: [], error: "Could not load the members' cars" });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const loading = loaded?.query !== query;
  return (
    <div className="space-y-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
      <label htmlFor="ee-member-search" className={labelCls}>
        Search members&apos; cars
      </label>
      <input id="ee-member-search" type="search" className={inputCls} value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Car, driver, team or member" />
      <div role="status" aria-live="polite">
        {loaded?.error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{loaded.error}</p>}
        {loading && <p className="text-xs text-zinc-500">Loading…</p>}
        {!loading && !loaded?.error && loaded?.cards.length === 0 && <p className="text-xs text-zinc-500">No members&apos; cars match.</p>}
      </div>
      {loaded && loaded.cards.length > 0 && (
        <ul className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
          {loaded.cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(c.imageUrl)}
                aria-label={`Use the picture from ${c.name} by ${c.owner}`}
                className="w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                <FullArtCard card={c} showDurability={false} />
                <span className="mt-1 block truncate text-[11px] font-bold">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
