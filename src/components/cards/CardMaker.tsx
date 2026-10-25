"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import ImageUploader from "@/components/ui/ImageUploader";
import { PhdCard } from "@/components/cards/PhdCard";
import {
  deleteCard,
  listShowcaseImages,
  saveCard,
  type ShowcaseImage,
} from "@/actions/admin/cards";
import { THEME_PRESETS, emptyCard, isHexColour, type CardData, type CardTheme } from "@/lib/card-maker";

type PrintMode = "single" | "sheet" | null;
type ImageTab = "upload" | "showcase";

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

function Slider({
  id,
  text,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  id: string;
  text: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={`${label} flex justify-between`}>
        <span>{text}</span>
        <span className="font-semibold normal-case tracking-normal">
          {Math.round(value)}
          {suffix}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full accent-amber-500"
      />
    </div>
  );
}

function ColourField({ id, text, value, onChange }: { id: string; text: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Keep the hex box in step when a preset (or the picker) changes the value.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          inputMode="text"
          aria-label={`${text} hex value`}
          value={draft}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (isHexColour(v)) onChange(v.toLowerCase());
          }}
          className={`${input} font-mono`}
        />
      </div>
    </div>
  );
}

export function CardMaker({ initialSaved }: { initialSaved: CardData[] }) {
  const isClient = useIsClient();
  const [card, setCard] = useState<CardData>(emptyCard);
  const [saved, setSaved] = useState<CardData[]>(initialSaved);
  const [imageTab, setImageTab] = useState<ImageTab>("upload");
  const [showcase, setShowcase] = useState<ShowcaseImage[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CardData>(key: K, value: CardData[K]) => setCard((c) => ({ ...c, [key]: value }));
  const setStat = (key: keyof CardData["stats"], value: string) =>
    setCard((c) => ({ ...c, stats: { ...c.stats, [key]: value.slice(0, 3) } }));
  const setTheme = (patch: Partial<CardTheme>) => setCard((c) => ({ ...c, theme: { ...c.theme, ...patch } }));

  // Load the showcase photos only when that tab is first opened.
  useEffect(() => {
    if (imageTab !== "showcase" || showcase !== null) return;
    let cancelled = false;
    listShowcaseImages().then((images) => {
      if (!cancelled) setShowcase(images);
    });
    return () => {
      cancelled = true;
    };
  }, [imageTab, showcase]);

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

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveCard(card);
      if (res.success) {
        setCard(res.data);
        setSaved((list) => [res.data, ...list.filter((c) => c.id !== res.data.id)]);
        setMessage({ text: `“${res.data.name}” saved` });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function remove(target: CardData) {
    if (!target.id || !window.confirm(`Delete “${target.name}”? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteCard(target.id!);
      if (res.success) {
        setSaved((list) => list.filter((c) => c.id !== target.id));
        if (card.id === target.id) setCard(emptyCard());
        setMessage({ text: "Card deleted" });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function startNew() {
    setCard(emptyCard());
    setMessage(null);
  }

  const printLayer =
    isClient && printMode
      ? createPortal(
          <div data-card-print>
            {printMode === "single" ? (
              <div style={{ padding: "12mm" }}>
                <div style={{ width: "63mm" }}>
                  <PhdCard card={card} flat />
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 63mm)",
                  gridAutoRows: "88mm",
                  // 3mm between cards leaves room to cut. 3 x 63 + 2 x 3 = 195mm wide and
                  // 3 x 88 + 2 x 3 = 270mm tall, which still fits A4 (210 x 297).
                  gap: "3mm",
                  justifyContent: "center",
                  paddingTop: "13mm",
                }}
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i}>
                    <PhdCard card={card} flat />
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

      {/* Preview + actions (sticks on desktop so it stays visible while editing) */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <div className="mx-auto w-full max-w-[320px] lg:max-w-none">
          <PhdCard card={card} className="drop-shadow-xl" placeholders />
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
            onClick={save}
            disabled={pending}
            className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {pending ? "Saving…" : card.id ? "Save changes" : "Save card"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPrintMode("single")}
              className="min-h-12 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Print card
            </button>
            <button
              type="button"
              onClick={() => setPrintMode("sheet")}
              className="min-h-12 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
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
        {/* Image */}
        <section className={panel} aria-label="Card image">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Image</h2>
            <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist">
              {(["upload", "showcase"] as const).map((t) => (
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
                  {t === "upload" ? "Upload" : "From showcase"}
                </button>
              ))}
            </div>
          </div>

          {imageTab === "upload" ? (
            <ImageUploader
              maxFiles={1}
              label="Upload card image"
              initialUrls={card.imageUrl ? [card.imageUrl] : []}
              onUploadComplete={(urls) => set("imageUrl", urls[0] ?? "")}
            />
          ) : showcase === null ? (
            <p className="py-6 text-center text-sm text-zinc-500">Loading showcase photos…</p>
          ) : showcase.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No showcase photos yet.</p>
          ) : (
            <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" aria-label="Showcase photos">
              {showcase.map((s) => {
                const active = s.imageUrl === card.imageUrl;
                return (
                  <li key={s.shellId}>
                    <button
                      type="button"
                      onClick={() => set("imageUrl", s.imageUrl)}
                      aria-pressed={active}
                      title={s.description || "Showcase photo"}
                      className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${
                        active ? "border-amber-500" : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.imageUrl} alt={s.description || "Showcase photo"} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {card.imageUrl && (
            <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <Slider id="img-zoom" text="Zoom" value={card.imageZoom} min={100} max={300} suffix="%" onChange={(n) => set("imageZoom", n)} />
              <Slider id="img-x" text="Left / right" value={card.imageX} min={0} max={100} suffix="%" onChange={(n) => set("imageX", n)} />
              <Slider id="img-y" text="Up / down" value={card.imageY} min={0} max={100} suffix="%" onChange={(n) => set("imageY", n)} />
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
            <label htmlFor="card-name" className={label}>Car name</label>
            <input id="card-name" className={input} value={card.name} maxLength={40} placeholder="e.g. Killerbody Evo" onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="card-ability" className={label}>Ability / chassis type</label>
            <input id="card-ability" className={input} value={card.ability} maxLength={48} placeholder="e.g. RWD · Carbon chassis" onChange={(e) => set("ability", e.target.value)} />
          </div>
          <div>
            <label htmlFor="card-effect" className={`${label} flex justify-between`}>
              <span>Effect / flavour text</span>
              <span className="font-semibold normal-case tracking-normal">{card.effect.length}/220</span>
            </label>
            <textarea id="card-effect" className={`${input} min-h-20`} rows={3} value={card.effect} maxLength={220} placeholder="What does this card do?" onChange={(e) => set("effect", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="card-driver" className={label}>Driver (on image)</label>
              <input id="card-driver" className={input} value={card.driver} maxLength={30} placeholder="e.g. Alex Smith" onChange={(e) => set("driver", e.target.value)} />
            </div>
            <div>
              <label htmlFor="card-team" className={label}>Team (on image)</label>
              <input id="card-team" className={input} value={card.team} maxLength={30} placeholder="e.g. Penthouse Racing" onChange={(e) => set("team", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="card-tier" className={label}>Tier</label>
              <input id="card-tier" className={input} value={card.tier} maxLength={4} placeholder="2" onChange={(e) => set("tier", e.target.value)} />
            </div>
            <div>
              <label htmlFor="card-spec" className={label}>Spec</label>
              <input id="card-spec" className={input} value={card.spec} maxLength={10} placeholder="Stock" onChange={(e) => set("spec", e.target.value)} />
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
                <label htmlFor={`stat-${key}`} className={label}>{text}</label>
                <input
                  id={`stat-${key}`}
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

        {/* Colours */}
        <section className={panel} aria-label="Card colours">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Colours</h2>
          <div role="group" aria-label="Colour presets" className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((p) => {
              const active = p.theme.accent === card.theme.accent && p.theme.body === card.theme.body && p.theme.text === card.theme.text;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setCard((c) => ({ ...c, theme: { ...p.theme } }))}
                  aria-pressed={active}
                  className={`flex min-h-11 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-xs font-bold ${
                    active ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700"
                  } text-zinc-800 dark:text-zinc-100`}
                >
                  <span className="h-8 w-8 rounded-full border-2" style={{ background: p.theme.accent, borderColor: p.theme.body }} aria-hidden />
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColourField id="colour-accent" text="Metal / accent" value={card.theme.accent} onChange={(hex) => setTheme({ accent: hex })} />
            <ColourField id="colour-body" text="Card body" value={card.theme.body} onChange={(hex) => setTheme({ body: hex })} />
            <ColourField id="colour-text" text="Plate text" value={card.theme.text} onChange={(hex) => setTheme({ text: hex })} />
            <ColourField id="colour-overlay" text="Driver / team text" value={card.overlayColour} onChange={(hex) => set("overlayColour", hex)} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Background shading</legend>
            <div className="flex gap-2">
              {([
                [true, "Shaded"],
                [false, "Flat colour"],
              ] as const).map(([value, label]) => {
                const active = card.backgroundShading === value;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("backgroundShading", value)}
                    className={`min-h-11 rounded-full border-2 px-4 text-xs font-bold ${
                      active ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
                    } text-zinc-800 dark:text-zinc-100`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Logo background</legend>
            <div className="flex gap-2">
              {([
                ["white", "White"],
                ["body", "Match card body"],
              ] as const).map(([value, label]) => {
                                const active = card.logoStyle === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("logoStyle", value)}
                    className={`min-h-11 rounded-full border-2 px-4 text-xs font-bold ${
                      active ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
                    } text-zinc-800 dark:text-zinc-100`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Logo lettering</legend>
            <div className="flex gap-2">
              {([
                ["black", "Black"],
                ["white", "White"],
              ] as const).map(([value, label]) => {
                const active = card.logoTone === value;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("logoTone", value)}
                    className={`min-h-11 rounded-full border-2 px-4 text-xs font-bold ${
                      active ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
                    } text-zinc-800 dark:text-zinc-100`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Logo outline</legend>
            <div className="flex gap-2">
              {([
                [false, "None"],
                [true, "Outline"],
              ] as const).map(([value, label]) => {
                const active = card.logoOutline === value;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("logoOutline", value)}
                    className={`min-h-11 rounded-full border-2 px-4 text-xs font-bold ${
                      active ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
                    } text-zinc-800 dark:text-zinc-100`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {card.logoOutline && (
              <div className="max-w-xs pt-1">
                <ColourField id="colour-logo-outline" text="Outline colour" value={card.logoOutlineColour} onChange={(hex) => set("logoOutlineColour", hex)} />
              </div>
            )}
          </fieldset>
        </section>

        {/* Saved cards */}
        <section className={panel} aria-label="Saved cards">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Saved cards ({saved.length})</h2>
          {saved.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing saved yet. Save a card and it appears here to edit or print again.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {saved.map((c) => (
                <li key={c.id} className={`space-y-2 rounded-xl border p-2 ${c.id === card.id ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <button type="button" onClick={() => { setCard(c); setMessage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="block w-full" aria-label={`Edit ${c.name}`}>
                    <PhdCard card={c} />
                  </button>
                  <p className="truncate text-center text-xs font-bold text-zinc-700 dark:text-zinc-200">{c.name}</p>
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
