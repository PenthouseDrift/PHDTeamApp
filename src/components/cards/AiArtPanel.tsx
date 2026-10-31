"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ImageUploader from "@/components/ui/ImageUploader";
import { generateCardArt } from "@/actions/admin/card-art";
import {
  listAdminCustomPrompts,
  saveAdminCustomPrompt,
  deleteAdminCustomPrompt,
  type AdminCustomPrompt,
} from "@/actions/admin/custom-prompts";
import { MAX_ART_STYLES } from "@/lib/full-art-card";
import {
  ART_PROMPT_MAX,
  ART_STYLES,
  ART_TIMES,
  applyArtOptions,
  stripArtOptions,
  type ArtPreset,
} from "@/lib/card-maker";

/**
 * The "AI art" panel shared by the original and full art card makers: reference photo, style
 * buttons, time-of-day / art-style options, an editable prompt, Gemini generation, and a
 * session list of the original plus everything generated so any of them can be picked again.
 * Only the presets and the picture shape differ between the makers. With `auto` set, the style
 * buttons and options are replaced by the tier's own prompt, with an optional art style added on top.
 */

const HISTORY_MAX = 30;

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const label = "mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const chip = (active: boolean) =>
  active ? "border-amber-500 bg-amber-500/10" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\/\S+$/i.test(u);

export interface AiArtPanelProps {
  /** Style buttons. Not used when `auto` is set. */
  presets?: ArtPreset[];
  /** Automatic mode: the prompt is set from outside (e.g. by the card's tier) and no style needs picking. */
  auto?: { label: string; hint: string; buildPrompt: (styleIds: string[]) => string };
  /** Shape Gemini is asked for: "5:4" for the original card's picture window, "3:4" for a full art card. */
  aspectRatio: "5:4" | "3:4";
  /** Tailwind aspect class for the thumbnails, matching aspectRatio. */
  thumbClass: string;
  /** The picture currently on the card. */
  currentImageUrl: string;
  /** Called with the picture to put on the card (a new generation, or one picked from the list). */
  onUseImage: (url: string) => void;
  /** sessionStorage key prefix, so each card maker keeps its own list. */
  storageKey: string;
  /** Makes element ids unique when two panels are on the page. */
  idPrefix: string;
  /** A preset to flag as matching the card (e.g. the card's tier). */
  suggestedPresetId?: string;
  footnote: string;
}

function SavedPromptsBar({
  savedPrompts,
  activeSavedPromptId,
  onSelectPrompt,
  onDeletePrompt,
  onOpenSaveModal,
  onClearActive,
  isAuto,
}: {
  savedPrompts: AdminCustomPrompt[];
  activeSavedPromptId: string | null;
  onSelectPrompt: (p: AdminCustomPrompt) => void;
  onDeletePrompt: (id: string, title: string) => void;
  onOpenSaveModal: () => void;
  onClearActive: () => void;
  isAuto: boolean;
}) {
  const activePrompt = savedPrompts.find((p) => p.id === activeSavedPromptId);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💾</span>
          <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
            Admin Saved Prompts ({savedPrompts.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenSaveModal}
          className="text-xs font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          + Save Current Prompt
        </button>
      </div>

      {savedPrompts.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No custom prompts saved yet. Edit any prompt and click &ldquo;Save Current Prompt&rdquo; to store it for future cards.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {savedPrompts.map((p) => {
            const isSelected = activeSavedPromptId === p.id;
            return (
              <div
                key={p.id}
                className={`group inline-flex items-center rounded-lg border text-xs transition-all ${
                  isSelected
                    ? "border-amber-500 bg-amber-500 text-black font-black shadow-sm"
                    : "border-zinc-300 bg-white text-zinc-800 hover:border-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectPrompt(p)}
                  className="px-2.5 py-1 text-left font-bold"
                  title={`Click to load:\n${p.prompt.slice(0, 140)}...`}
                >
                  {p.title}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePrompt(p.id, p.title);
                  }}
                  title={`Delete "${p.title}"`}
                  className={`px-1.5 py-1 text-[11px] opacity-60 hover:opacity-100 hover:text-red-600 ${
                    isSelected ? "text-black" : "text-zinc-400"
                  }`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activePrompt && (
        <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-xs">
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            Active custom preset: <strong>{activePrompt.title}</strong>
          </span>
          <button
            type="button"
            onClick={onClearActive}
            className="font-bold text-red-600 hover:underline dark:text-red-400"
          >
            {isAuto ? "Revert to Tier Prompt" : "Clear Preset"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AiArtPanel({
  presets = [],
  auto,
  aspectRatio,
  thumbClass,
  currentImageUrl,
  onUseImage,
  storageKey,
  idPrefix,
  suggestedPresetId,
  footnote,
}: AiArtPanelProps) {
  const historyKey = `${storageKey}-history`;
  const originalKey = `${storageKey}-original`;

  // Reference photo, prompt text, and which preset button filled it (null = custom).
  const [artRef, setArtRef] = useState("");
  const [artRefKey, setArtRefKey] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  // Every picture generated this session, newest first. Kept in sessionStorage so a refresh keeps them.
  const [history, setHistory] = useState<string[]>([]);
  const loaded = useRef(false);
  // Automatic mode: the prompt is the tier's prompt plus the chosen art style. It is rebuilt when the tier or style
  // changes, and any hand edits are dropped then.
  const [autoStyles, setAutoStyles] = useState<string[]>([]);
  const [edited, setEdited] = useState<string | null>(null);
  const [seenAuto, setSeenAuto] = useState(auto?.label);
  if (seenAuto !== auto?.label) {
    setSeenAuto(auto?.label);
    setEdited(null);
  }
  const activePrompt = auto ? (edited ?? auto.buildPrompt(autoStyles)) : prompt;
  const [generating, startGenerating] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const [savedPrompts, setSavedPrompts] = useState<AdminCustomPrompt[]>([]);
  const [activeSavedPromptId, setActiveSavedPromptId] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savingTitle, setSavingTitle] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptFeedback, setPromptFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("admin-custom-prompts");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedPrompts(parsed);
        }
      }
    } catch {}

    listAdminCustomPrompts()
      .then((prompts) => {
        if (Array.isArray(prompts)) {
          setSavedPrompts(prompts);
          try {
            localStorage.setItem("admin-custom-prompts", JSON.stringify(prompts));
          } catch {}
        }
      })
      .catch((err) => {
        console.error("Failed to fetch admin custom prompts:", err);
      });
  }, []);

  useEffect(() => {
    if (!promptFeedback) return;
    const timer = setTimeout(() => setPromptFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [promptFeedback]);

  function applySavedPrompt(p: AdminCustomPrompt) {
    setActiveSavedPromptId(p.id);
    if (auto) {
      setEdited(p.prompt);
      if (detailsRef.current) {
        detailsRef.current.open = true;
      }
    } else {
      setPrompt(p.prompt);
      setPresetId(null);
    }
    setPromptFeedback({ text: `Loaded prompt preset: “${p.title}”` });
  }

  function clearActiveSavedPrompt() {
    setActiveSavedPromptId(null);
    if (auto) {
      setEdited(null);
    } else {
      setPrompt("");
      setPresetId(null);
    }
    setPromptFeedback(null);
  }

  async function handleSavePrompt(e?: React.FormEvent) {
    e?.preventDefault();
    if (!savingTitle.trim()) return;
    const promptToSave = activePrompt.trim();
    if (!promptToSave) {
      setPromptFeedback({ text: "Write or edit a prompt first before saving", error: true });
      return;
    }
    setSavingPrompt(true);
    setPromptFeedback(null);
    try {
      const res = await saveAdminCustomPrompt({
        id: updateExisting && activeSavedPromptId ? activeSavedPromptId : undefined,
        title: savingTitle.trim(),
        prompt: promptToSave,
      });
      if (res.success) {
        setSavedPrompts((prev) => {
          const next = [res.data, ...prev.filter((p) => p.id !== res.data.id)];
          try {
            localStorage.setItem("admin-custom-prompts", JSON.stringify(next));
          } catch {}
          return next;
        });
        setActiveSavedPromptId(res.data.id);
        setIsSaveModalOpen(false);
        setSavingTitle("");
        setPromptFeedback({ text: `Saved custom prompt “${res.data.title}” successfully!` });
      } else {
        setPromptFeedback({ text: res.error, error: true });
      }
    } catch {
      setPromptFeedback({ text: "Failed to save prompt", error: true });
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleDeletePrompt(id: string, title: string) {
    if (!window.confirm(`Delete saved prompt “${title}”?`)) return;
    try {
      const res = await deleteAdminCustomPrompt(id);
      if (res.success) {
        setSavedPrompts((prev) => {
          const next = prev.filter((p) => p.id !== id);
          try {
            localStorage.setItem("admin-custom-prompts", JSON.stringify(next));
          } catch {}
          return next;
        });
        if (activeSavedPromptId === id) {
          setActiveSavedPromptId(null);
        }
        setPromptFeedback({ text: `Deleted prompt “${title}”` });
      } else {
        setPromptFeedback({ text: res.error, error: true });
      }
    } catch {
      setPromptFeedback({ text: "Failed to delete prompt", error: true });
    }
  }

  // Restore this session's art, then keep storage in step with the list.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      try {
        const raw = JSON.parse(sessionStorage.getItem(historyKey) ?? "[]");
        if (Array.isArray(raw)) {
          const urls = raw.filter(isHttps);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser
          if (urls.length) setHistory(urls.slice(0, HISTORY_MAX));
        }
        const original = sessionStorage.getItem(originalKey) ?? "";
        if (isHttps(original)) {
          setArtRef(original);
          // The uploader only reads its starting pictures once, so remount it to show the restored one.
          setArtRefKey((k) => k + 1);
        }
      } catch {
        /* storage unavailable or corrupt: start empty */
      }
      return;
    }
    try {
      sessionStorage.setItem(historyKey, JSON.stringify(history));
      sessionStorage.setItem(originalKey, artRef);
    } catch {
      /* storage full or blocked: the list still works until reload */
    }
  }, [history, artRef, historyKey, originalKey]);

  /** Auto mode: add or remove an art style on top of the tier's prompt (null clears them all). */
  function pickAutoStyle(id: string | null) {
    setAutoStyles((list) => {
      if (id === null) return [];
      if (list.includes(id)) return list.filter((x) => x !== id);
      return list.length >= MAX_ART_STYLES ? list : [...list, id];
    });
    setEdited(null);
  }

  function generate() {
    setMessage(null);
    startGenerating(async () => {
      const res = await generateCardArt({ referenceUrl: artRef, prompt: activePrompt, aspectRatio });
      if (res.success) {
        const url = res.data.imageUrl;
        onUseImage(url);
        setHistory((list) => [url, ...list.filter((u) => u !== url)].slice(0, HISTORY_MAX));
        setMessage({ text: "Art added to the card. Generate again for another take." });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  const gallery = [
    ...(artRef ? [{ url: artRef, original: true }] : []),
    ...history.filter((u) => u !== artRef).map((url) => ({ url, original: false })),
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className={label}>1. Reference photo of the car</p>
        <ImageUploader
          key={artRefKey}
          maxFiles={1}
          label="Upload reference photo"
          initialUrls={artRef ? [artRef] : []}
          onUploadComplete={(urls) => setArtRef(urls[0] ?? "")}
        />
        {currentImageUrl && currentImageUrl !== artRef && (
          <button
            type="button"
            onClick={() => {
              setArtRef(currentImageUrl);
              setArtRefKey((k) => k + 1);
            }}
            className="min-h-10 text-sm font-bold text-amber-600 hover:underline dark:text-amber-400"
          >
            Use the current card image as the reference
          </button>
        )}
      </div>

      {auto ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className={label}>2. Tier prompt</p>
            <p className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-3 py-2.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              {auto.label} tier
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {auto.hint}. The scene, time of day, colours and effects always follow the tier you picked.
              </span>
            </p>
          </div>
          <div className="space-y-1.5">
            <p className={`${label} flex justify-between`}>
              <span>3. Art styles (optional, added to the tier prompt)</span>
              <span className="font-semibold normal-case tracking-normal">
                {autoStyles.length}/{MAX_ART_STYLES} chosen
              </span>
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Art styles">
              {[{ id: null, label: "None" }, ...ART_STYLES].map((o) => {
                const active = o.id === null ? autoStyles.length === 0 : autoStyles.includes(o.id);
                // Once three are chosen the rest are locked until one is un-picked.
                const locked = o.id !== null && !active && autoStyles.length >= MAX_ART_STYLES;
                return (
                  <button
                    key={o.id ?? "none"}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => pickAutoStyle(o.id)}
                    className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-100 ${chip(active)}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pick up to {MAX_ART_STYLES}. They are blended into one look. Click a chosen style again to remove it.
            </p>
          </div>
          {/* Saved Custom Prompts Bar */}
          <SavedPromptsBar
            savedPrompts={savedPrompts}
            activeSavedPromptId={activeSavedPromptId}
            onSelectPrompt={applySavedPrompt}
            onDeletePrompt={handleDeletePrompt}
            onOpenSaveModal={() => {
              const active = savedPrompts.find((p) => p.id === activeSavedPromptId);
              setSavingTitle(active ? active.title : "");
              setUpdateExisting(Boolean(active));
              setIsSaveModalOpen(true);
            }}
            onClearActive={clearActiveSavedPrompt}
            isAuto={true}
          />

          <details ref={detailsRef} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="min-h-8 cursor-pointer text-sm font-bold text-zinc-700 dark:text-zinc-200">
              Edit the prompt (optional){edited !== null ? (activeSavedPromptId ? ` · using preset: ${savedPrompts.find((p) => p.id === activeSavedPromptId)?.title ?? "custom"}` : " · edited") : ""}
            </summary>
            <div className="mt-2 space-y-2">
              <label htmlFor={`${idPrefix}-art-prompt`} className={`${label} flex justify-between`}>
                <span>Prompt</span>
                <span className="font-semibold normal-case tracking-normal">
                  {activePrompt.length}/{ART_PROMPT_MAX}
                </span>
              </label>
              <textarea
                id={`${idPrefix}-art-prompt`}
                className={`${input} min-h-40`}
                rows={8}
                value={activePrompt}
                maxLength={ART_PROMPT_MAX}
                onChange={(e) => setEdited(e.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const active = savedPrompts.find((p) => p.id === activeSavedPromptId);
                      setSavingTitle(active ? active.title : "");
                      setUpdateExisting(Boolean(active));
                      setIsSaveModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline dark:text-amber-400"
                  >
                    💾 Save this prompt as preset...
                  </button>
                  {activeSavedPromptId && (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      (Active: {savedPrompts.find((p) => p.id === activeSavedPromptId)?.title})
                    </span>
                  )}
                </div>
                {edited !== null && (
                  <button
                    type="button"
                    onClick={clearActiveSavedPrompt}
                    className="min-h-8 text-xs font-bold text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
                  >
                    Back to {auto.label} prompt
                  </button>
                )}
              </div>
            </div>
          </details>
        </div>
      ) : (
        <>
      <div className="space-y-2">
        <p className={label}>2. Pick a style</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Art style prompts">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={presetId === p.id}
              onClick={() => {
                setPrompt(applyArtOptions(p.prompt, time, style));
                setPresetId(p.id);
                setActiveSavedPromptId(null);
              }}
              className={`min-h-12 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold text-zinc-800 dark:text-zinc-100 ${chip(presetId === p.id)}`}
            >
              {p.label}
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {p.id === suggestedPresetId ? `${p.hint} · matches card` : p.hint}
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={presetId === null && !activeSavedPromptId}
            onClick={() => {
              setPrompt(applyArtOptions("", time, style));
              setPresetId(null);
              setActiveSavedPromptId(null);
            }}
            className={`min-h-12 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold text-zinc-800 dark:text-zinc-100 ${chip(presetId === null && !activeSavedPromptId)}`}
          >
            Custom
            <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Write your own</span>
          </button>
        </div>
      </div>

      {/* Saved Custom Prompts Bar in Original Mode */}
      <SavedPromptsBar
        savedPrompts={savedPrompts}
        activeSavedPromptId={activeSavedPromptId}
        onSelectPrompt={applySavedPrompt}
        onDeletePrompt={handleDeletePrompt}
        onOpenSaveModal={() => {
          const active = savedPrompts.find((p) => p.id === activeSavedPromptId);
          setSavingTitle(active ? active.title : "");
          setUpdateExisting(Boolean(active));
          setIsSaveModalOpen(true);
        }}
        onClearActive={clearActiveSavedPrompt}
        isAuto={false}
      />

      <div className="space-y-3">
        <p className={label}>Options (added to the end of the prompt)</p>
        {(
          [
            ["time", "Time of day", ART_TIMES, time, setTime],
            ["style", "Art style", ART_STYLES, style, setStyle],
          ] as const
        ).map(([group, title, options, current, setCurrent]) => (
          <div key={group} className="space-y-1.5">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{title}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
              {options.map((o) => {
                const active = current === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      // Click again to clear the option.
                      const next = active ? null : o.id;
                      setCurrent(next);
                      setPrompt((p) =>
                        applyArtOptions(p, group === "time" ? next : time, group === "style" ? next : style)
                      );
                    }}
                    className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold text-zinc-800 dark:text-zinc-100 ${chip(active)}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-art-prompt`} className={`${label} flex justify-between`}>
          <span>3. Prompt</span>
          <span className="font-semibold normal-case tracking-normal">
            {prompt.length}/{ART_PROMPT_MAX}
          </span>
        </label>
        <textarea
          id={`${idPrefix}-art-prompt`}
          className={`${input} min-h-40`}
          rows={8}
          value={prompt}
          maxLength={ART_PROMPT_MAX}
          placeholder="Describe the art, or pick a style above and tweak it. Mention the reference image so the car stays true to the photo."
          onChange={(e) => {
            setPrompt(e.target.value);
            // Editing a preset's text makes it a custom prompt.
            const p = presets.find((x) => x.id === presetId);
            if (p && p.prompt !== stripArtOptions(e.target.value)) setPresetId(null);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const active = savedPrompts.find((p) => p.id === activeSavedPromptId);
                setSavingTitle(active ? active.title : "");
                setUpdateExisting(Boolean(active));
                setIsSaveModalOpen(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline dark:text-amber-400"
            >
              💾 Save this prompt as preset...
            </button>
            {activeSavedPromptId && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                (Active: {savedPrompts.find((p) => p.id === activeSavedPromptId)?.title})
              </span>
            )}
          </div>
          {prompt.trim() && (
            <button
              type="button"
              onClick={clearActiveSavedPrompt}
              className="text-xs font-bold text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
            >
              Clear prompt
            </button>
          )}
        </div>
      </div>

        </>
      )}

      {promptFeedback && (
        <p
          role={promptFeedback.error ? "alert" : "status"}
          className={`rounded-lg border p-2.5 text-sm font-bold ${
            promptFeedback.error
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
              : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {promptFeedback.text}
        </p>
      )}

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
        onClick={generate}
        disabled={generating || !artRef || !activePrompt.trim()}
        className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {generating ? "Generating… this can take up to a minute" : "Generate art"}
      </button>

      {gallery.length > 0 && (
        <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <p className={`${label} mb-0`}>
              Original &amp; generated this session{history.length > 0 ? ` (${history.length})` : ""}
            </p>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Clear this list? Pictures already used on saved cards are kept.")) setHistory([]);
                }}
                className="min-h-10 text-xs font-bold text-red-600 hover:underline dark:text-red-400"
              >
                Clear list
              </button>
            )}
          </div>
          <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" aria-label="Original and generated art">
            {gallery.map(({ url, original }, i) => {
              const active = url === currentImageUrl;
              return (
                <li key={url}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={
                      original
                        ? "Use the original reference photo as the card image"
                        : `Use generated image ${gallery.length - i} as the card image`
                    }
                    onClick={() => onUseImage(url)}
                    className={`relative block ${thumbClass} w-full overflow-hidden rounded-lg border-2 ${
                      active ? "border-amber-500" : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {original && (
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                        Original
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Click a picture, including the original, to use it as the card image.</p>
        </div>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{footnote}</p>

      {/* Save Custom Prompt Modal */}
      {isSaveModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSaveModalOpen(false);
          }}
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>💾</span>
                <span>Save Admin Custom Prompt</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-sm font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrompt} className="space-y-3">
              <div>
                <label className={label}>Prompt Name / Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={60}
                  placeholder="e.g. Tokyo Midnight Rain, Anime Cel Shaded"
                  value={savingTitle}
                  onChange={(e) => setSavingTitle(e.target.value)}
                  className={input}
                />
              </div>

              <div>
                <label className={label}>Prompt Text Preview</label>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300 font-mono whitespace-pre-wrap">
                  {activePrompt}
                </div>
              </div>

              {activeSavedPromptId && (
                <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
                  <p className="font-bold text-zinc-700 dark:text-zinc-200">Save Mode</p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-zinc-700 dark:text-zinc-300">
                      <input
                        type="radio"
                        name="saveMode"
                        checked={updateExisting}
                        onChange={() => setUpdateExisting(true)}
                      />
                      <span>Update existing</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-zinc-700 dark:text-zinc-300">
                      <input
                        type="radio"
                        name="saveMode"
                        checked={!updateExisting}
                        onChange={() => setUpdateExisting(false)}
                      />
                      <span>Save as new preset</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPrompt || !savingTitle.trim()}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {savingPrompt ? "Saving..." : updateExisting ? "Update Preset" : "Save Preset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
