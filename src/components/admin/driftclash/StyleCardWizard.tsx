"use client";

import { useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import ImageUploader from "@/components/ui/ImageUploader";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier, type EntryVariant } from "@/lib/pack-config";
import { QUESTION_IMAGE, frameFieldsFor, type PackStyle } from "@/lib/pack-styles";
import { statFieldsOf, statsChoiceError, type StatsChoice } from "@/lib/stats-choice";
import { createCardFromPictureAction } from "@/actions/admin/driftclash-packs";
import { MemberCarPicker } from "@/components/admin/driftclash/MemberCarPicker";
import { NO_RESTYLE, RestylePanel, type RestyleChoice } from "@/components/admin/driftclash/RestylePanel";
import { StatsModeControl } from "@/components/admin/driftclash/StatsModeControl";
import type { SetCard } from "@/components/admin/driftclash/PackEditor";
import { generatedPreviewCard, inputCls, labelCls, primaryBtn, secondaryBtn, stylePreviewCard, tierLabel } from "@/components/admin/driftclash/preview";

type Step = "choose" | "member" | "upload";

/**
 * What happens when a style is chosen on a rarity. Two ways to use it:
 *  1. "Use this style": the style takes a share of the rarity, and a card in this style is drawn from a car photo each time
 *     it comes up (a member's own car, or a community car). Nothing is chosen here.
 *  2. "Make a card in this style": pick one picture yourself, either a member's car or one you upload, redraw it in the
 *     style, and save the result as a card this pack gives out.
 */
export function StyleCardWizard({
  tier,
  style,
  styles,
  alreadyInRarity,
  onUseStyle,
  onCardAdded,
  onBack,
}: {
  tier: FullArtTier;
  style: PackStyle;
  styles: PackStyle[];
  /** The style itself is already on this rarity, so "Use this style" is not offered again. */
  alreadyInRarity?: boolean;
  /** Add the style itself to the rarity. */
  onUseStyle: () => void;
  /** A card made in this style was saved; add it to the rarity. `variant` is what the entry keeps (reroll at the pull). */
  onCardAdded: (card: SetCard, variant: EntryVariant | undefined) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");

  const back = (to: Step) => (
    <button type="button" className={secondaryBtn} onClick={() => (to === "choose" && step === "choose" ? onBack() : setStep(to))}>
      ← {to === "choose" && step === "choose" ? "Back to styles" : "Back"}
    </button>
  );

  if (step === "member") {
    return (
      <div className="space-y-4">
        {back("choose")}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick a member&apos;s car. It will be redrawn in <strong>{style.name}</strong> and saved as a {tierLabel(tier)} card.
        </p>
        <MemberCarPicker tier={tier} styles={styles} lockedStyleId={style.id} onImported={(card, variant) => onCardAdded(card, variant)} />
      </div>
    );
  }

  if (step === "upload") {
    return (
      <div className="space-y-4">
        {back("choose")}
        <UploadedCardForm tier={tier} style={style} onCardAdded={onCardAdded} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back("choose")}
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-36 shrink-0 self-center sm:self-start">
          <FullArtCard card={stylePreviewCard(style, tier)} showDurability={false} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-base font-black">{style.name}</p>
            {style.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{style.description}</p>}
          </div>

          <button
            type="button"
            onClick={onUseStyle}
            disabled={alreadyInRarity}
            className="block w-full rounded-xl border border-zinc-300 p-3 text-left hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
          >
            <span className="block text-sm font-black">Use this style{alreadyInRarity ? ` (already on ${tierLabel(tier)})` : ""}</span>
            <span className="block text-xs text-zinc-600 dark:text-zinc-400">
              The style takes a share of {tierLabel(tier)} cards. Each time it comes up a new card is drawn in this style from a car photo (the member&apos;s
              own, or a community car). Every one uses an AI image.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("member")}
            className="block w-full rounded-xl border border-zinc-300 p-3 text-left hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-zinc-700"
          >
            <span className="block text-sm font-black">Make a card in this style from a member&apos;s car</span>
            <span className="block text-xs text-zinc-600 dark:text-zinc-400">
              Choose a car, redraw it in this style and check the result before it goes in. The pack then gives out this one card. Redrawing uses one AI
              image.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStep("upload")}
            className="block w-full rounded-xl border border-zinc-300 p-3 text-left hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-zinc-700"
          >
            <span className="block text-sm font-black">Make a card in this style from my own picture</span>
            <span className="block text-xs text-zinc-600 dark:text-zinc-400">
              Upload a picture, add the card&apos;s name and details, and redraw it in this style (or keep your picture and just use the style&apos;s
              frame).
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** The words, picture and stats for a card made from an uploaded picture in a chosen style. */
function UploadedCardForm({
  tier,
  style,
  onCardAdded,
}: {
  tier: FullArtTier;
  style: PackStyle;
  onCardAdded: (card: SetCard, variant: EntryVariant | undefined) => void;
}) {
  const [pictureUrl, setPictureUrl] = useState("");
  const [uploaderKey, setUploaderKey] = useState(0);
  const [details, setDetails] = useState({ name: "", ability: "", effect: "", driver: "", team: "" });
  const [restyle, setRestyle] = useState<RestyleChoice>({ ...NO_RESTYLE, styleId: style.id });
  // A new card has no stats yet, so it starts with a roll for this rarity. "Keep" means use those.
  const [startStats] = useState(() => rollStatsForTier(tier, Math.random));
  const [statsChoice, setStatsChoice] = useState<StatsChoice>({ mode: "reroll", stats: startStats });
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  const statsError = statsChoiceError(statsChoice, { tier }, tier);
  const shownStats: FullArtCardData["stats"] = statsChoice.mode === "custom" ? statsChoice.stats : startStats;
  const preview: FullArtCardData = {
    ...generatedPreviewCard(tier),
    name: details.name || "Card name",
    ability: details.ability || "Chassis",
    effect: details.effect,
    driver: details.driver || "Driver",
    team: details.team || "Team",
    stats: shownStats,
    imageUrl: restyle.artUrl ?? (pictureUrl || QUESTION_IMAGE),
    ...frameFieldsFor(style.frame),
  };

  const set = (key: keyof typeof details) => (e: React.ChangeEvent<HTMLInputElement>) => setDetails((d) => ({ ...d, [key]: e.target.value }));

  function add() {
    setError(null);
    const fields = statsChoice.mode === "keep" ? { stats: startStats } : statFieldsOf(statsChoice);
    const variant: EntryVariant = { styleId: style.id, ...(restyle.artUrl ? { artUrl: restyle.artUrl } : {}), ...fields };
    startAdd(async () => {
      const res = await createCardFromPictureAction({ pictureUrl, details, tier, variant });
      if (res.success) onCardAdded(res.data.card as SetCard, res.data.entryVariant);
      else setError(res.error);
    });
  }

  const canAdd = Boolean(pictureUrl) && details.name.trim().length > 0 && !statsError && !adding;

  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div className="w-44 shrink-0 self-center sm:self-start">
        <FullArtCard card={preview} showDurability={false} />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-2">
          <p className={labelCls}>Your picture</p>
          <ImageUploader
            key={uploaderKey}
            maxFiles={1}
            label="Style card picture"
            initialUrls={pictureUrl ? [pictureUrl] : []}
            onUploadComplete={(urls) => {
              setPictureUrl(urls[0] ?? "");
              // A redraw belongs to the picture it was drawn from.
              setRestyle({ styleId: style.id, artUrl: null });
            }}
          />
          {pictureUrl && (
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                setPictureUrl("");
                setRestyle({ styleId: style.id, artUrl: null });
                setUploaderKey((k) => k + 1);
              }}
            >
              Choose a different picture
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="uc-name" className={labelCls}>
              Card name
            </label>
            <input id="uc-name" className={inputCls} value={details.name} maxLength={40} onChange={set("name")} placeholder="e.g. Silvia S15" />
          </div>
          <div>
            <label htmlFor="uc-ability" className={labelCls}>
              Chassis
            </label>
            <input id="uc-ability" className={inputCls} value={details.ability} maxLength={48} onChange={set("ability")} placeholder="e.g. MST RMX 2.5" />
          </div>
          <div>
            <label htmlFor="uc-driver" className={labelCls}>
              Driver
            </label>
            <input id="uc-driver" className={inputCls} value={details.driver} maxLength={30} onChange={set("driver")} />
          </div>
          <div>
            <label htmlFor="uc-team" className={labelCls}>
              Team
            </label>
            <input id="uc-team" className={inputCls} value={details.team} maxLength={30} onChange={set("team")} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="uc-effect" className={labelCls}>
              Description
            </label>
            <input id="uc-effect" className={inputCls} value={details.effect} maxLength={160} onChange={set("effect")} placeholder="Parts or a line of text" />
          </div>
        </div>

        {pictureUrl && (
          <RestylePanel
            styles={[style]}
            tier={tier}
            source={{ kind: "upload", url: pictureUrl }}
            choice={restyle}
            onChange={setRestyle}
            disabled={adding}
            lockedStyleId={style.id}
          />
        )}

        <StatsModeControl
          tier={tier}
          saved={{ tier, stats: startStats }}
          value={statsChoice}
          onChange={setStatsChoice}
          disabled={adding}
          name="upload-stats"
        />

        <div role="status" aria-live="polite">
          {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <button type="button" className={primaryBtn} disabled={!canAdd} onClick={add}>
          {adding ? "Saving…" : `Save card and add to ${tierLabel(tier)}`}
        </button>
        {!canAdd && !adding && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{!pictureUrl ? "Upload a picture to continue." : !details.name.trim() ? "Give the card a name." : ""}</p>
        )}
      </div>
    </div>
  );
}
