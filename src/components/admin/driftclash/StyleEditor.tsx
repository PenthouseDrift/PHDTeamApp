"use client";

import { useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import ImageUploader from "@/components/ui/ImageUploader";
import { FULL_ART_TIERS, type FullArtTier } from "@/lib/full-art-card";
import {
  PACK_STYLE_COLOUR_FIELDS,
  type PackStyle,
  type PackStyleColourField,
  type PackStyleColours,
  type PackStylePromptMode,
  type StyleFrameEffect,
  stylePrompt,
} from "@/lib/pack-styles";
import type { AdminCustomPrompt } from "@/actions/admin/custom-prompts";
import { deletePackStyle, savePackStyle } from "@/actions/admin/pack-styles";
import { generateCardArt } from "@/actions/admin/card-art";
import {
  Modal,
  PreviewTile,
  StyleDetails,
  chip,
  dangerBtn,
  inputCls,
  labelCls,
  panel,
  primaryBtn,
  secondaryBtn,
  stylePreviewCard,
  tierLabel,
} from "@/components/admin/driftclash/preview";
import type { Notice } from "@/components/admin/driftclash/PackEditor";

const COLOUR_LABELS: Record<PackStyleColourField, { label: string; placeholder: string; fallback: string }> = {
  customBorderColor: { label: "Card border", placeholder: "e.g. #000000", fallback: "#e8b923" },
  customStatLabelColor: { label: "Stat labels", placeholder: "e.g. #ffffff", fallback: "#ffffff" },
  customStatValueColor: { label: "Stat values", placeholder: "e.g. #ff2d55", fallback: "#ffffff" },
  customBottomBarBgColor: { label: "Bottom box background", placeholder: "e.g. rgba(0,0,0,0.55)", fallback: "#09090b" },
  customBottomBarBorderColor: { label: "Bottom box border", placeholder: "e.g. #ff2d55", fallback: "#e8b923" },
};

const EFFECTS: Array<{ value: StyleFrameEffect; label: string; hint: string }> = [
  { value: "tier", label: "The rarity's own", hint: "Legend and Mythic keep their usual effects (switched off by a border colour)." },
  { value: "none", label: "No effect", hint: "A plain frame in your colours." },
  { value: "flames", label: "Flames", hint: "The Mythic fire around the border. You can colour it." },
  { value: "prismatic", label: "Prismatic", hint: "The Legend rainbow glow around the border." },
];

const HEX = /^#[0-9a-f]{6}$/i;

interface FormState {
  id?: string;
  name: string;
  description: string;
  sourcePromptId?: string;
  prompt: string;
  promptMode: PackStylePromptMode;
  effect: StyleFrameEffect;
  shine: boolean;
  flameColour: string;
  colours: PackStyleColours;
  sampleImageUrl?: string;
}

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  prompt: "",
  promptMode: "full",
  effect: "tier",
  shine: false,
  flameColour: "",
  colours: {},
});

const fromStyle = (s: PackStyle): FormState => ({
  id: s.id,
  name: s.name,
  description: s.description,
  sourcePromptId: s.sourcePromptId,
  prompt: s.prompt,
  promptMode: s.promptMode,
  effect: s.frame.effect,
  shine: s.frame.shine,
  flameColour: s.frame.flameColour ?? "",
  colours: { ...s.frame.colours },
  sampleImageUrl: s.sampleImageUrl,
});

export function StyleEditor({
  styles,
  savedPrompts,
  usage,
  onSaved,
  onDeleted,
  onNotify,
}: {
  styles: PackStyle[];
  savedPrompts: AdminCustomPrompt[];
  /** Style id -> names of the packs using it. */
  usage: Record<string, string[]>;
  onSaved: (style: PackStyle) => void;
  onDeleted: (id: string) => void;
  onNotify: (notice: Notice) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [previewTier, setPreviewTier] = useState<FullArtTier>("legend");
  const [detail, setDetail] = useState<PackStyle | null>(null);
  const [pending, startTransition] = useTransition();
  // The car photo used to draw a preview. It is only for previews and is not saved with the style.
  const [refUrl, setRefUrl] = useState("");
  const [generating, startGenerating] = useTransition();

  const noChange = !form.prompt.trim() && Object.keys(form.colours).length === 0 && form.effect === "tier";

  function reset(next: FormState = emptyForm()) {
    setForm(next);
    setUploaderKey((k) => k + 1);
  }

  function setColour(field: PackStyleColourField, value: string) {
    setForm((f) => {
      const colours = { ...f.colours };
      if (value.trim()) colours[field] = value;
      else delete colours[field];
      return { ...f, colours };
    });
  }

  function loadSavedPrompt(id: string) {
    const p = savedPrompts.find((x) => x.id === id);
    if (!p) return setForm((f) => ({ ...f, sourcePromptId: undefined }));
    setForm((f) => ({ ...f, sourcePromptId: p.id, prompt: p.prompt, promptMode: "full", name: f.name || p.title }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await savePackStyle({
        id: form.id,
        name: form.name,
        description: form.description,
        sourcePromptId: form.sourcePromptId,
        prompt: form.prompt,
        promptMode: form.promptMode,
        frame: {
          colours: form.colours,
          effect: form.effect,
          shine: form.shine,
          flameColour: form.effect === "flames" && HEX.test(form.flameColour) ? form.flameColour : undefined,
        },
        sampleImageUrl: form.sampleImageUrl,
      });
      if (res.success) {
        onSaved(res.data);
        reset();
        onNotify({ text: `Saved "${res.data.name}". Add it to a pack's rarity to start pulling it.` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  /** Draw the preview picture from the style's prompt at the chosen rarity, using the reference car photo. */
  function generatePreview() {
    if (!refUrl) return onNotify({ text: "Add a car photo to draw the preview from first.", error: true });
    startGenerating(async () => {
      const res = await generateCardArt({ referenceUrl: refUrl, prompt: stylePrompt(previewStyle, previewTier), aspectRatio: "3:4" });
      if (res.success) {
        setForm((f) => ({ ...f, sampleImageUrl: res.data.imageUrl }));
        setUploaderKey((k) => k + 1);
        onNotify({ text: "Preview drawn. It is saved with the style when you save." });
      } else {
        onNotify({ text: res.error, error: true });
      }
    });
  }

  function remove(style: PackStyle) {
    const used = usage[style.id]?.length ?? 0;
    const warning = used > 0 ? ` It is used in ${used} pack${used === 1 ? "" : "s"} and will be taken out of them.` : "";
    if (!window.confirm(`Delete the style "${style.name}"?${warning} Cards already pulled with it keep their look.`)) return;
    startTransition(async () => {
      const res = await deletePackStyle(style.id);
      if (res.success) {
        onDeleted(style.id);
        if (form.id === style.id) reset();
        onNotify({ text: `Deleted "${style.name}".` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  const previewStyle: PackStyle = {
    id: form.id ?? "preview-style",
    name: form.name.trim() || "New style",
    description: "",
    prompt: form.prompt,
    promptMode: form.promptMode,
    frame: {
      colours: form.colours,
      effect: form.effect,
      shine: form.shine,
      ...(form.effect === "flames" && HEX.test(form.flameColour) ? { flameColour: form.flameColour } : {}),
    },
    sampleImageUrl: form.sampleImageUrl,
    createdAt: 0,
    updatedAt: 0,
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Style library</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          A style is an art prompt plus a card frame. It does nothing until you add it to a pack&apos;s rarity on the Packs tab, where you
          set how often it is pulled.
        </p>
        {styles.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No styles yet. Create one below.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {styles.map((s) => (
              <PreviewTile
                key={s.id}
                card={stylePreviewCard(s, previewTier)}
                title={s.name}
                subtitle={usage[s.id]?.length ? `In ${usage[s.id].length} pack${usage[s.id].length === 1 ? "" : "s"}` : "Not used yet"}
                onOpen={() => setDetail(s)}
              >
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`${secondaryBtn} !min-h-8 flex-1 !px-2`}
                    onClick={() => {
                      reset(fromStyle(s));
                      document.getElementById("style-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className={`${dangerBtn} !min-h-8 !px-2`} disabled={pending} onClick={() => remove(s)}>
                    Delete
                  </button>
                </div>
              </PreviewTile>
            ))}
          </div>
        )}
      </section>

      <form id="style-form" onSubmit={submit} className={panel} aria-labelledby="style-form-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="style-form-title" className="text-base font-black text-zinc-900 dark:text-zinc-100">
            {form.id ? "Edit style" : "New style"}
          </h3>
          {form.id && (
            <button type="button" className={secondaryBtn} onClick={() => reset()}>
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="st-name" className={labelCls}>Name</label>
                <input id="st-name" className={inputCls} maxLength={60} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Black Flame" />
              </div>
              <div>
                <label htmlFor="st-desc" className={labelCls}>Note (optional)</label>
                <input id="st-desc" className={inputCls} maxLength={200} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Only you see this" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label htmlFor="st-prompt" className={labelCls}>Art prompt</label>
                {savedPrompts.length > 0 && (
                  <div className="w-full sm:w-64">
                    <label htmlFor="st-saved" className="sr-only">Load a saved prompt</label>
                    <select id="st-saved" className={inputCls} value={form.sourcePromptId ?? ""} onChange={(e) => loadSavedPrompt(e.target.value)}>
                      <option value="">Load a saved prompt…</option>
                      {savedPrompts.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <textarea
                id="st-prompt"
                className={`${inputCls} min-h-32`}
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                placeholder="Leave empty to only change the card frame. The rarity's normal prompt is used."
              />
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="sr-only">How the prompt is used</legend>
                {(
                  [
                    ["full", "Full prompt", "Sent exactly as written (like a prompt saved from the Card maker)."],
                    ["style", "Art style", "A style description added on top of the rolled rarity's scene."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="flex items-start gap-2">
                    <input type="radio" name="st-mode" className="mt-1" checked={form.promptMode === value} onChange={() => setForm((f) => ({ ...f, promptMode: value }))} />
                    <span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-100">{label}</span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>

            <fieldset className="space-y-3">
              <legend className={labelCls}>Card frame</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="st-effect" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Frame effect</label>
                  <select id="st-effect" className={inputCls} value={form.effect} onChange={(e) => setForm((f) => ({ ...f, effect: e.target.value as StyleFrameEffect }))}>
                    {EFFECTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{EFFECTS.find((o) => o.value === form.effect)?.hint}</p>
                </div>
                {form.effect === "flames" && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label htmlFor="st-flame" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Flame colour</label>
                      <input id="st-flame" className={inputCls} maxLength={7} value={form.flameColour} placeholder="#000000 (blank keeps the fire colours)" onChange={(e) => setForm((f) => ({ ...f, flameColour: e.target.value }))} />
                    </div>
                    <input type="color" aria-label="Flame colour picker" className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-300 bg-transparent p-1 dark:border-zinc-700" value={HEX.test(form.flameColour) ? form.flameColour : "#000000"} onChange={(e) => setForm((f) => ({ ...f, flameColour: e.target.value }))} />
                  </div>
                )}
              </div>
              {form.effect !== "tier" && (
                <label className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  <input type="checkbox" checked={form.shine} onChange={(e) => setForm((f) => ({ ...f, shine: e.target.checked }))} />
                  Glint and sparkles over the picture
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {PACK_STYLE_COLOUR_FIELDS.map((field) => {
                  const meta = COLOUR_LABELS[field];
                  const value = form.colours[field] ?? "";
                  return (
                    <div key={field} className="flex items-end gap-2">
                      <div className="flex-1">
                        <label htmlFor={`st-${field}`} className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">{meta.label}</label>
                        <input id={`st-${field}`} className={inputCls} value={value} maxLength={40} placeholder={meta.placeholder} onChange={(e) => setColour(field, e.target.value)} />
                      </div>
                      <input type="color" aria-label={`${meta.label} colour picker`} className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-300 bg-transparent p-1 dark:border-zinc-700" value={HEX.test(value) ? value : meta.fallback} onChange={(e) => setColour(field, e.target.value)} />
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-3">
              <div>
                <p className={labelCls}>Preview picture (optional)</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Shown on this style&apos;s tiles and in the card preview instead of a &quot;?&quot;. Draw it from the prompt above, or upload a
                  picture. It is only for previews; members get a newly drawn picture.
                </p>
              </div>
              <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Draw it from the prompt</p>
                <ImageUploader
                  maxFiles={1}
                  label="Pack style reference car"
                  initialUrls={refUrl ? [refUrl] : []}
                  onUploadComplete={(urls) => setRefUrl(urls[0] ?? "")}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={primaryBtn} disabled={generating || !refUrl} onClick={generatePreview}>
                    {generating ? "Drawing… (up to a minute)" : `Draw preview at ${tierLabel(previewTier)}`}
                  </button>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Uses the &quot;Preview on&quot; rarity, the prompt and the car photo. Each click makes one image.
                    {!form.prompt.trim() && " With no prompt it draws the rarity's normal look."}
                  </span>
                </div>
              </div>
              <details className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <summary className="cursor-pointer text-xs font-bold text-zinc-700 dark:text-zinc-200">Or upload a finished picture</summary>
                <div className="mt-3">
                  <ImageUploader
                    key={uploaderKey}
                    maxFiles={1}
                    label="Pack style sample"
                    initialUrls={form.sampleImageUrl ? [form.sampleImageUrl] : []}
                    onUploadComplete={(urls) => setForm((f) => ({ ...f, sampleImageUrl: urls[0] }))}
                  />
                </div>
              </details>
              {form.sampleImageUrl && (
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => {
                    setForm((f) => ({ ...f, sampleImageUrl: undefined }));
                    setUploaderKey((k) => k + 1);
                  }}
                >
                  Remove preview picture
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={primaryBtn} disabled={pending || noChange || !form.name.trim()}>
                {pending ? "Saving…" : form.id ? "Save changes" : "Create style"}
              </button>
              {noChange && <span className="text-xs text-zinc-500 dark:text-zinc-400">Add a prompt, a colour or a frame effect to save.</span>}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="st-tier" className={labelCls}>Preview on</label>
            <select id="st-tier" className={inputCls} value={previewTier} onChange={(e) => setPreviewTier(e.target.value as FullArtTier)}>
              {FULL_ART_TIERS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <div className="w-48 max-w-full">
              <FullArtCard card={stylePreviewCard(previewStyle, previewTier)} />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              The frame is exact. The picture is drawn from the prompt when a pack is opened.
            </p>
            <span className={chip}>{tierLabel(previewTier)}</span>
          </div>
        </div>
      </form>

      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <StyleDetails style={detail} tier={previewTier} />
        </Modal>
      )}
    </div>
  );
}
