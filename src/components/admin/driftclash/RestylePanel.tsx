"use client";

import { useState, useTransition } from "react";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { frameFieldsFor, type PackStyle } from "@/lib/pack-styles";
import { restyleCardArtAction } from "@/actions/admin/driftclash-packs";
import { labelCls, secondaryBtn } from "@/components/admin/driftclash/preview";

/** Which style from the style library is put on a card, and the redrawn picture if there is one. */
export interface RestyleChoice {
  styleId: string | null;
  /** A picture from the AI redraw. Null means the card keeps its own picture. */
  artUrl: string | null;
}

export const NO_RESTYLE: RestyleChoice = { styleId: null, artUrl: null };

/** The card as it will look with the choice applied: the style's frame, and the redrawn picture if there is one. */
export function restyledPreview<T extends FullArtCardData>(card: T, choice: RestyleChoice, styles: PackStyle[]): T {
  const style = choice.styleId ? styles.find((s) => s.id === choice.styleId) : undefined;
  if (!style) return card;
  return { ...card, ...frameFieldsFor(style.frame), imageUrl: choice.artUrl ?? card.imageUrl };
}

/**
 * Pick a style from the style library to restyle a card with. The frame (colours, effect, shine) comes across for free.
 * A style that has an art prompt can also redraw the picture, which costs one AI image and is shown first, so nothing
 * is spent on a card that is then not added. The card preview in the parent updates as the choice changes.
 */
export function RestylePanel({
  styles,
  tier,
  source,
  choice,
  onChange,
  disabled,
  lockedStyleId,
}: {
  styles: PackStyle[];
  /** The rarity the card is going on; the redraw uses that rarity's scene. */
  tier: FullArtTier;
  /** A member's card, a saved set card, or a picture just uploaded (an address in our own file store). */
  source: { kind: "member" | "saved"; id: string } | { kind: "upload"; url: string };
  choice: RestyleChoice;
  onChange: (choice: RestyleChoice) => void;
  disabled?: boolean;
  /** The style was already chosen (from the Styles tab), so it is shown rather than picked. */
  lockedStyleId?: string;
}) {
  const [redrawing, startRedraw] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const style = choice.styleId ? styles.find((s) => s.id === choice.styleId) : undefined;
  const hasArtPrompt = Boolean(style?.prompt.trim());
  const busy = disabled || redrawing;

  function pick(styleId: string) {
    setError(null);
    onChange({ styleId: styleId || null, artUrl: null });
  }

  function redraw() {
    if (!style) return;
    setError(null);
    startRedraw(async () => {
      const res = await restyleCardArtAction({ source, styleId: style.id, tier });
      if (res.success) onChange({ styleId: style.id, artUrl: res.data.imageUrl });
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
      {lockedStyleId ? (
        <p className={labelCls}>Style</p>
      ) : (
        <label htmlFor="restyle-style" className={labelCls}>
          Restyle with a pack style
        </label>
      )}
      {lockedStyleId ? (
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{style?.name ?? "This style"}</p>
      ) : styles.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No styles yet. Create one on the Styles tab, then restyle cards with it here.</p>
      ) : (
        <select
          id="restyle-style"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          value={choice.styleId ?? ""}
          disabled={busy}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">Keep its current look</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.prompt.trim() ? "frame + artwork" : "frame only"})
            </option>
          ))}
        </select>
      )}

      {style && (
        <div className="space-y-2">
          {style.description && <p className="text-xs text-zinc-600 dark:text-zinc-400">{style.description}</p>}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">The style&apos;s frame is put on the card. The preview shows how it looks.</p>

          {hasArtPrompt ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondaryBtn} onClick={redraw} disabled={busy}>
                  {redrawing ? "Redrawing…" : choice.artUrl ? "Redraw again" : "Redraw the artwork in this style"}
                </button>
                {choice.artUrl && (
                  <button type="button" className={secondaryBtn} onClick={() => onChange({ styleId: style.id, artUrl: null })} disabled={busy}>
                    {source.kind === "upload" ? "Use my picture as it is" : "Use the original artwork"}
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {redrawing
                  ? "This takes up to half a minute."
                  : choice.artUrl
                    ? "Redrawn artwork is shown in the preview and will be used when you add the card."
                    : "Optional. Each redraw uses one AI image, so check the preview before redrawing again."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">This style only changes the frame, so the artwork stays as it is.</p>
          )}
        </div>
      )}

      <div role="status" aria-live="polite">
        {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
