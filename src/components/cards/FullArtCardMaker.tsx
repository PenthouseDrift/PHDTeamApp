"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import ImageUploader from "@/components/ui/ImageUploader";
import { AiArtPanel } from "@/components/cards/AiArtPanel";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { FULL_CARD_AREA, ImageAdjuster } from "@/components/cards/ImageAdjuster";
import { deleteFullArtCard, saveFullArtCard, setCardPullable } from "@/actions/admin/full-art-cards";
import {
  FULL_ART_TIERS,
  emptyFullArtCard,
  tierArtPrompt,
  tierInfo,
  type FullArtCardData,
  type FullArtStats,
} from "@/lib/full-art-card";

/**
 * The card maker for the full art cards. The picture fills the whole card and the tier
 * (bronze, silver, gold, legend) sets the frame colours and, for the AI art, the whole style:
 * pick a tier and the prompt, time of day, colours and scene follow it automatically.
 */

type PrintMode = "single" | "sheet" | null;
type ImageTab = "upload" | "ai";

const subscribe = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const label = "mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const panel = "space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const outlineButton =
  "min-h-12 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

export function FullArtCardMaker({
  initialSaved,
  initialFeatured = {},
  onSavedCardsChange,
}: {
  initialSaved: FullArtCardData[];
  /** Saved card id -> odds weight, for the cards that can be pulled from packs. */
  initialFeatured?: Record<string, number>;
  onSavedCardsChange?: (cards: FullArtCardData[]) => void;
}) {
  const isClient = useIsClient();
  const [card, setCard] = useState<FullArtCardData>(emptyFullArtCard);
  const [saved, setSaved] = useState<FullArtCardData[]>(initialSaved);
  const [imageTab, setImageTab] = useState<ImageTab>("ai");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  // Touch only drags the picture while this is on, so the page can still be scrolled with a finger.
  const [touchAdjust, setTouchAdjust] = useState(false);
  const [pending, startTransition] = useTransition();
  // Cards that can drop as a pack's rare third card, and the odds weight typed for the open card.
  const [featured, setFeatured] = useState<Record<string, number>>(initialFeatured);
  const [weightText, setWeightText] = useState("10");

  const tier = tierInfo(card.tier);

  const set = <K extends keyof FullArtCardData>(key: K, value: FullArtCardData[K]) => setCard((c) => ({ ...c, [key]: value }));
  const setStat = (key: keyof FullArtStats, value: string) =>
    setCard((c) => ({ ...c, stats: { ...c.stats, [key]: value.slice(0, 3) } }));
  const useImage = (url: string) => setCard((c) => ({ ...c, imageUrl: url, imageZoom: 100, imageX: 50, imageY: 50 }));

  // Print: render the print layer, open the dialog, then remove the layer.
  useEffect(() => {
    if (!printMode) return;
    const done = () => setPrintMode(null);
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printMode]);

  /**
   * Saves the card. A new card (or "Save as new card") keeps the name as typed and gets its own
   * auto-generated id on the server, like member cards, so the same name can be saved many times
   * (for example one per tier). "Save changes" updates the open card.
   */
  function save(asNew = false, thenPullable = false) {
    setMessage(null);
    const creating = asNew || !card.id;
    const toSave: FullArtCardData = creating ? { ...card, id: undefined } : card;
    startTransition(async () => {
      const res = await saveFullArtCard(toSave);
      if (res.success) {
        setCard(res.data);
        setSaved((list) => {
          const updated = [res.data, ...list.filter((c) => c.id !== res.data.id)];
          onSavedCardsChange?.(updated);
          return updated;
        });
        const savedText = `“${res.data.name}” saved (card ${res.data.id?.slice(0, 8)})`;
        const weight = Math.round(Number(weightText));
        if (thenPullable && res.data.id && res.data.imageUrl && weight >= 1 && weight <= 100) {
          const pull = await setCardPullable(res.data.id, weight);
          if (pull.success) {
            const id = res.data.id;
            setFeatured((f) => ({ ...f, [id]: weight }));
            setMessage({ text: `${savedText} and added to pullable cards` });
          } else {
            setMessage({ text: `${savedText}, but it could not be added to pullable cards: ${pull.error}`, error: true });
          }
        } else if (thenPullable) {
          setMessage({ text: `${savedText}. Not added to pullable cards: it needs a picture and odds from 1 to 100`, error: true });
        } else {
          setMessage({ text: savedText });
        }
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  const featuredTotal = Object.values(featured).reduce((sum, w) => sum + w, 0);
  const isPullable = Boolean(card.id && featured[card.id]);
  // The picture on screen is not the one saved for this card (new art was made since), so it is a different card.
  const pictureChanged = Boolean(card.id && saved.find((c) => c.id === card.id)?.imageUrl !== card.imageUrl);
  const pullableCards = saved.filter((c) => c.id && featured[c.id]);

  function setPullable(on: boolean) {
    if (!card.id) return;
    const id = card.id;
    const weight = Math.round(Number(weightText));
    if (on && (!Number.isFinite(weight) || weight < 1 || weight > 100)) {
      setMessage({ text: "Odds must be a whole number from 1 to 100", error: true });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await setCardPullable(id, on ? weight : null);
      if (res.success) {
        setFeatured((f) => {
          const next = { ...f };
          if (on) next[id] = weight;
          else delete next[id];
          return next;
        });
        setMessage({ text: on ? `“${card.name}” can drop in packs (weight ${weight})` : `“${card.name}” removed from pullable cards` });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function remove(target: FullArtCardData) {
    if (!target.id || !window.confirm(`Delete “${target.name}”? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteFullArtCard(target.id!);
      if (res.success) {
        setSaved((list) => {
          const updated = list.filter((c) => c.id !== target.id);
          onSavedCardsChange?.(updated);
          return updated;
        });
        setFeatured((f) => {
          const next = { ...f };
          delete next[target.id!];
          return next;
        });
        if (card.id === target.id) setCard(emptyFullArtCard());
        setMessage({ text: "Card deleted" });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function startNew() {
    setCard(emptyFullArtCard());
    setMessage(null);
  }

  const printLayer =
    isClient && printMode
      ? createPortal(
          <div data-card-print>
            {printMode === "single" ? (
              <div style={{ padding: "12mm" }}>
                <div style={{ width: "63mm" }}>
                  <FullArtCard card={card} flat />
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 63mm)",
                  gridAutoRows: "88mm",
                  // 3mm between cards leaves room to cut: 3 x 63 + 2 x 3 = 195mm by 3 x 88 + 2 x 3 = 270mm, which fits A4.
                  gap: "3mm",
                  justifyContent: "center",
                  paddingTop: "13mm",
                }}
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i}>
                    <FullArtCard card={card} flat />
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
      {printLayer}

      {/* Preview + actions */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <div className="mx-auto w-full max-w-[320px] lg:max-w-none">
          {/* The wrapper is a size container so the adjust layer can use the card's own cqw units. */}
          <div className="relative" style={{ containerType: "inline-size" }}>
            <FullArtCard card={card} className="drop-shadow-xl" placeholders />
            {card.imageUrl && (
              <ImageAdjuster
                area={FULL_CARD_AREA}
                value={{ x: card.imageX, y: card.imageY, zoom: card.imageZoom }}
                onChange={(v) => setCard((c) => ({ ...c, imageX: v.x, imageY: v.y, imageZoom: v.zoom }))}
                touchEnabled={touchAdjust}
              />
            )}
          </div>
          {card.imageUrl && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Zoom {card.imageZoom}%
                <span className="hidden [@media(pointer:fine)]:inline"> · drag to move, scroll to zoom</span>
              </p>
              <button
                type="button"
                aria-pressed={touchAdjust}
                onClick={() => setTouchAdjust((on) => !on)}
                className={`min-h-11 rounded-full border-2 px-4 text-xs font-bold [@media(pointer:fine)]:hidden ${
                  touchAdjust ? "border-amber-500 bg-amber-500/10" : "border-zinc-300 dark:border-zinc-700"
                } text-zinc-800 dark:text-zinc-100`}
              >
                {touchAdjust ? "Done" : "Move & zoom"}
              </button>
            </div>
          )}
        </div>

        <div className={panel}>
          {message && (
            <p
              role={message.error ? "alert" : "status"}
              className={`rounded-lg border p-2.5 text-sm font-bold ${
                message.error
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              }`}
            >
              {message.text}
            </p>
          )}
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {pending ? "Saving…" : card.id ? "Save changes" : "Save card"}
          </button>
          {card.id && (
            <button type="button" onClick={() => save(true)} disabled={pending} className={`${outlineButton} w-full disabled:opacity-50`}>
              Save as new card
            </button>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            To keep this car in more than one tier, change the tier, generate, then use &ldquo;Save as new card&rdquo;. The name
            stays the same; each saved card gets its own auto-generated id.
          </p>
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">Pullable in packs</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Optional. A pullable card is a set card: this exact picture is given out, never redrawn. Each pack has a 1 in 100
              chance of a third bonus card, picked from the pullable cards by the odds weight.
            </p>
            <label htmlFor="fa-odds" className={label}>
              Odds weight (1 to 100)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="fa-odds"
                className={`${input} w-24`}
                value={weightText}
                inputMode="numeric"
                maxLength={3}
                onChange={(e) => setWeightText(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Bigger number = shows up more often than your other pullable cards.
                {Object.keys(featured).length > 0 ? ` Currently ${Object.keys(featured).length} pullable.` : ""}
              </p>
            </div>

            {card.id && isPullable && !pictureChanged ? (
              <>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  This card is pullable: weight {featured[card.id]}, {Math.round((featured[card.id] / featuredTotal) * 100)}% of bonus drops.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPullable(true)} disabled={pending} className={`${outlineButton} disabled:opacity-50`}>
                    Update odds
                  </button>
                  <button type="button" onClick={() => setPullable(false)} disabled={pending} className={`${outlineButton} disabled:opacity-50`}>
                    Remove
                  </button>
                </div>
                <button type="button" onClick={startNew} disabled={pending} className={`${outlineButton} w-full disabled:opacity-50`}>
                  Make another card
                </button>
              </>
            ) : card.id && !pictureChanged ? (
              <button type="button" onClick={() => setPullable(true)} disabled={pending || !card.imageUrl} className={`${outlineButton} w-full disabled:opacity-50`}>
                Add this card to pullable cards
              </button>
            ) : (
              <>
                {pictureChanged && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">The picture has changed, so this will be a new card. The earlier one stays as it was.</p>
                )}
                <button
                  type="button"
                  onClick={() => save(true, true)}
                  disabled={pending || !card.imageUrl || !card.name.trim()}
                  className={`${outlineButton} w-full disabled:opacity-50`}
                >
                  Save as new card and add to pullable cards
                </button>
              </>
            )}
            {card.tier === "mythic" && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Mythic cards only ever reach members this way.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPrintMode("single")} className={outlineButton}>
              Print card
            </button>
            <button type="button" onClick={() => setPrintMode("sheet")} className={outlineButton}>
              Print sheet of 9
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Prints at Pokémon card size (63 × 88 mm) on A4. In the print dialog, set scale to 100% and turn on
            background graphics. Choose &ldquo;Save as PDF&rdquo; to keep a file.
          </p>
          {card.id && (
            <button type="button" onClick={startNew} className="min-h-10 w-full rounded-lg text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Start a new card
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-4">
        {/* Tier */}
        <section className={panel} aria-label="Card tier">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Tier</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Card tier">
            {FULL_ART_TIERS.map((t) => {
              const active = card.tier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (t.id === "mythic") {
                      setCard((c) => ({
                        ...c,
                        tier: "mythic",
                        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
                      }));
                    } else {
                      set("tier", t.id);
                    }
                  }}
                  className={`flex min-h-14 items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left text-sm font-black text-zinc-800 dark:text-zinc-100 ${
                    active ? "border-amber-500 bg-amber-500/10" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-6 w-6 shrink-0 rounded-full border border-black/20"
                    style={{
                      background:
                        t.id === "legend"
                          ? "conic-gradient(#7df9ff, #a78bfa, #ff7ad9, #ffd75e, #7df9ff)"
                          : t.id === "mythic"
                            ? "conic-gradient(#fff1b8, #ff2d55, #ffb020, #ff2d55, #fff1b8)"
                            : `linear-gradient(135deg, ${t.palette.light}, ${t.palette.accent} 55%, ${t.palette.dark})`,
                    }}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pick the tier and the frame colours and the AI art scene, time of day, colours and effects all follow it, from a
            gritty bronze backstreet at dusk to a mythic legend sky. In the AI art tab you can add up to 3 art styles (realistic,
            cartoon, anime, pixel art and more) on top of the tier&rsquo;s prompt.
          </p>
        </section>

        {/* Image */}
        <section className={panel} aria-label="Card image">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Image</h2>
            <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist">
              {(["ai", "upload"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={imageTab === t}
                  onClick={() => setImageTab(t)}
                  className={`min-h-9 rounded-md px-3 text-xs font-bold transition-colors ${
                    imageTab === t ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {t === "ai" ? "AI art" : "Upload"}
                </button>
              ))}
            </div>
          </div>

          {imageTab === "upload" && (
            <ImageUploader
              maxFiles={1}
              label="Upload card image"
              initialUrls={card.imageUrl ? [card.imageUrl] : []}
              onUploadComplete={(urls) => set("imageUrl", urls[0] ?? "")}
            />
          )}

          {/* Always mounted (just hidden) so the session list survives switching tabs. */}
          <div hidden={imageTab !== "ai"}>
            <AiArtPanel
              auto={{ label: tier.label, hint: tier.hint, buildPrompt: (styleIds) => tierArtPrompt(card.tier, styleIds) }}
              aspectRatio="3:4"
              thumbClass="aspect-[3/4]"
              currentImageUrl={card.imageUrl}
              onUseImage={useImage}
              storageKey="card-maker:full-art"
              idPrefix="full-art"
              footnote="Uses Gemini. The result is portrait 3:4, the closest ratio it offers to the 63 × 88 card, and fills the whole card. Keep the car in the middle; the edges can trim a little."
            />
          </div>

          {card.imageUrl && (
            <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Move and zoom the picture on the card preview: drag it, then scroll or pinch to zoom. On a phone, switch on
                &ldquo;Move &amp; zoom&rdquo; under the preview first.
              </p>
              <button
                type="button"
                onClick={() => setCard((c) => ({ ...c, imageZoom: 100, imageX: 50, imageY: 50 }))}
                className="mr-4 min-h-10 text-sm font-bold text-amber-600 hover:underline dark:text-amber-400"
              >
                Reset position
              </button>
              <button
                type="button"
                onClick={() => setCard((c) => ({ ...c, imageUrl: "", imageZoom: 100, imageX: 50, imageY: 50 }))}
                className="min-h-10 text-sm font-bold text-red-600 hover:underline dark:text-red-400"
              >
                Remove image
              </button>
            </div>
          )}
        </section>

        {/* Details */}
        <section className={panel} aria-label="Card details">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Details</h2>
          <div>
            <label htmlFor="fa-name" className={label}>Car name</label>
            <input id="fa-name" className={input} value={card.name} maxLength={40} placeholder="e.g. Killerbody Evo" onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="fa-ability" className={label}>Ability / chassis type</label>
            <input id="fa-ability" className={input} value={card.ability} maxLength={48} placeholder="e.g. RWD · Carbon chassis" onChange={(e) => set("ability", e.target.value)} />
          </div>
          <div>
            <label htmlFor="fa-effect" className={`${label} flex justify-between`}>
              <span>Effect / flavour text</span>
              <span className="font-semibold normal-case tracking-normal">{card.effect.length}/160</span>
            </label>
            <textarea id="fa-effect" className={`${input} min-h-20`} rows={3} value={card.effect} maxLength={160} placeholder="What does this card do?" onChange={(e) => set("effect", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fa-driver" className={label}>Driver</label>
              <input id="fa-driver" className={input} value={card.driver} maxLength={30} placeholder="e.g. Alex Smith" onChange={(e) => set("driver", e.target.value)} />
            </div>
            <div>
              <label htmlFor="fa-team" className={label}>Team</label>
              <input id="fa-team" className={input} value={card.team} maxLength={30} placeholder="e.g. Penthouse Racing" onChange={(e) => set("team", e.target.value)} />
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className={panel} aria-label="Card stats">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Stats</h2>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["drift", "Drift"],
                ["accel", "Accel"],
                ["grip", "Grip"],
                ["steer", "Steer"],
              ] as const
            ).map(([key, text]) => (
              <div key={key}>
                <label htmlFor={`fa-stat-${key}`} className={label}>{text}</label>
                <input
                  id={`fa-stat-${key}`}
                  className={`${input} text-center`}
                  value={card.stats[key]}
                  maxLength={3}
                  inputMode="numeric"
                  placeholder="–"
                  onChange={(e) => setStat(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Pullable cards: the set cards that can drop as a pack's bonus third card */}
        <section className={panel} aria-label="Pullable cards">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Pullable in packs ({pullableCards.length})</h2>
          {pullableCards.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No pullable cards yet. Save a card, then use &ldquo;Add to pullable cards&rdquo; next to the preview. Each pack has a 1 in 100 chance of
              a bonus card from this list.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pullableCards.map((c) => (
                <li key={c.id} className={`space-y-2 rounded-xl border p-2 ${c.id === card.id ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setCard(c);
                      setMessage(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="block w-full"
                    aria-label={`Edit ${c.name}`}
                  >
                    <FullArtCard card={c} />
                  </button>
                  <p className="truncate text-center text-xs font-bold text-zinc-700 dark:text-zinc-200">{c.name}</p>
                  <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                    {tierInfo(c.tier).label} · weight {featured[c.id!]} · {Math.round((featured[c.id!] / featuredTotal) * 100)}% of bonus drops
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Saved cards */}
        <section className={panel} aria-label="Saved full art cards">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Saved full art cards ({saved.length})</h2>
          {saved.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing saved yet. Save a card and it appears here to edit or print again.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {saved.map((c) => (
                <li key={c.id} className={`space-y-2 rounded-xl border p-2 ${c.id === card.id ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setCard(c);
                      setMessage(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="block w-full"
                    aria-label={`Edit ${c.name}`}
                  >
                    <FullArtCard card={c} />
                  </button>
                  <p className="truncate text-center text-xs font-bold text-zinc-700 dark:text-zinc-200">
                    {c.name}
                    {c.id && featured[c.id] ? " ★" : ""}
                  </p>
                  <p className="truncate text-center font-mono text-[10px] text-zinc-400">{c.id?.slice(0, 8)}</p>
                  <button type="button" onClick={() => remove(c)} disabled={pending} className="min-h-9 w-full rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
