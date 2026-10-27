"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import ImageUploader from "@/components/ui/ImageUploader";
import { PackOpening } from "@/components/member-cards/PackOpening";
import { ChassisSelector } from "@/components/cars/ChassisSelector";
import { keepCard, openCardPack, rerollCard } from "@/actions/member-cards";
import { PartSelector } from "@/components/member-cards/PartSelector";
import { REROLL_ENABLED, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { parseRememberedPack, readRememberedPack, saveRememberedPack, type RememberedPack } from "@/lib/card-pack-memory";
import { PARTS_LINE_MAX, PART_CATEGORIES, composeParts, emptyParts, type PartKey, type PartValues } from "@/lib/rc-parts-data";

/**
 * The step-by-step card pack flow:
 *   1 name (filled in from the account)  2 team (optional)  3 chassis and car photo (from the garage)
 *   4 parts (motor, ESC, gyro, servo, controller; all optional)  5 review and open
 * then the pack animation, then keep the card or re-roll it once.
 */

/** What to put in the chassis box for a garage car: its saved chassis, else its name (many people name the car after the chassis). */
const chassisFor = (car: { chassis: string; name: string } | null | undefined) => car?.chassis?.trim() || car?.name?.trim() || "";

/** Teams anyone can tap, alongside the member's own recent teams. */
const COMMON_TEAMS = ["Penthouse Drift", "Independent"];

/** A row of tap-to-fill buttons. The one matching the current value is highlighted. */
function QuickPicks({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: string[];
  value: string;
  onPick: (option: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{title}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {options.map((o) => {
          const active = value.trim().toLowerCase() === o.toLowerCase();
          return (
            <button
              key={o}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(o)}
              className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold text-zinc-800 dark:text-zinc-100 ${
                active ? "border-amber-500 bg-amber-500/10" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface GarageCar {
  carId: string;
  name: string;
  chassis: string;
  images: string[];
}

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "Name" },
  { n: 2, label: "Team" },
  { n: 3, label: "Chassis" },
  { n: 4, label: "Parts" },
  { n: 5, label: "Open" },
];

const input =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300";
const panel = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

interface WizardProps {
  /** Whose answers are remembered on this device. */
  userId: string;
  defaultName: string;
  /** Other names the member could tap to use (nickname, first name, account name). */
  nameOptions: string[];
  /** Teams from the member's earlier cards. */
  recentTeams: string[];
  cars: GarageCar[];
  initialCredits: number;
}

/** What the form starts with: the garage defaults, replaced by the last pack's answers when there are any. */
function startingAnswers(cars: GarageCar[], defaultName: string, remembered: RememberedPack | null) {
  const start: { driver: string; team: string; carId: string | null; chassis: string; photoUrl: string; parts: PartValues } = {
    driver: defaultName,
    team: "",
    carId: cars[0]?.carId ?? null,
    chassis: chassisFor(cars[0]),
    photoUrl: cars[0]?.images[0] ?? "",
    parts: emptyParts(),
  };
  if (!remembered) return start;

  if (remembered.driver) start.driver = remembered.driver;
  start.team = remembered.team;
  start.parts = remembered.parts;

  if (remembered.carId) {
    // A garage car that has since been deleted is ignored, so the defaults stay.
    const savedCar = cars.find((c) => c.carId === remembered.carId);
    if (savedCar) {
      start.carId = savedCar.carId;
      start.chassis = remembered.chassis || chassisFor(savedCar);
      start.photoUrl = remembered.photoUrl || (savedCar.images[0] ?? "");
    }
  } else if (remembered.photoUrl) {
    // "A different car", with the photo uploaded last time.
    start.carId = null;
    start.chassis = remembered.chassis;
    start.photoUrl = remembered.photoUrl;
  }
  return start;
}

const noSubscription = () => () => {};

/**
 * Reads the last pack's answers from this device's localStorage, then shows the form filled in with
 * them. localStorage doesn't exist on the server, so the first render uses the defaults and the form
 * is swapped for the filled-in one as soon as the browser has read the storage (before anyone types).
 */
export function CardPackWizard(props: WizardProps) {
  const stored = useSyncExternalStore(
    noSubscription,
    () => readRememberedPack(props.userId),
    () => undefined,
  );
  return (
    <CardPackWizardForm
      key={stored === undefined ? "loading" : "ready"}
      {...props}
      remembered={stored === undefined ? null : parseRememberedPack(stored)}
    />
  );
}

function CardPackWizardForm({
  userId,
  defaultName,
  nameOptions,
  recentTeams,
  cars,
  initialCredits,
  remembered,
}: WizardProps & { remembered: RememberedPack | null }) {
  const [credits, setCredits] = useState(initialCredits);
  const [start] = useState(() => startingAnswers(cars, defaultName, remembered));

  // The answers
  const [step, setStep] = useState<Step>(1);
  const [driver, setDriver] = useState(start.driver);
  const [team, setTeam] = useState(start.team);
  const [carId, setCarId] = useState<string | null>(start.carId);
  const [chassis, setChassis] = useState(start.chassis);
  const [photoUrl, setPhotoUrl] = useState(start.photoUrl);
  const [uploadKey, setUploadKey] = useState(0);
  const [parts, setParts] = useState(start.parts);
  // The parts become the card's one line of text, e.g. "Hobbywing XeRun V10 G4 · Acuvance Xarvis XX".
  const description = composeParts(parts);
  const partsTooLong = description.length > PARTS_LINE_MAX;

  // The pack
  const [mode, setMode] = useState<"form" | "pack">("form");
  const [run, setRun] = useState(0);
  const [card, setCard] = useState<MemberCard | null>(null);
  /** The second card some packs hold, built from another member's card. */
  const [bonus, setBonus] = useState<MemberCard | null>(null);
  /** The rare third card from the admin's pullable set. */
  const [featured, setFeatured] = useState<MemberCard | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmReroll, setConfirmReroll] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const car = cars.find((c) => c.carId === carId) ?? null;

  const chooseCar = (next: GarageCar | null) => {
    setCarId(next?.carId ?? null);
    setChassis(chassisFor(next));
    setPhotoUrl(next?.images[0] ?? "");
    setUploadKey((k) => k + 1);
  };

  const canNext = step === 1 ? driver.trim().length > 0 : step === 3 ? Boolean(photoUrl) : step === 4 ? !partsTooLong : true;

  const resultRef = useRef<HTMLDivElement>(null);
  // On small screens the card fills the view, so bring the result text and buttons into sight once revealed.
  useEffect(() => {
    if (!revealed || !resultRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [revealed]);

  const onRevealed = useCallback(() => setRevealed(true), []);

  function open() {
    setError(null);
    setCard(null);
    setBonus(null);
    setFeatured(null);
    setReady(false);
    setRevealed(false);
    setConfirmReroll(false);
    setSaved(false);
    setRun((r) => r + 1);
    setMode("pack");
    startTransition(async () => {
      const res = await openCardPack({
        driver,
        team,
        chassis,
        description,
        carName: car?.name,
        referenceUrl: photoUrl,
      });
      if (res.success) {
        // Remember these answers so the next pack starts filled in.
        saveRememberedPack(userId, { driver: driver.trim(), team: team.trim(), carId, chassis: chassis.trim(), photoUrl, parts });
        setCard(res.data.card);
        setBonus(res.data.bonus);
        setFeatured(res.data.featured);
        setCredits(res.data.credits);
        setReady(true);
      } else {
        // Nothing was spent, so go back to the form with the reason.
        setError(res.error);
        setMode("form");
        if (res.field === "driver") setStep(1);
        else if (res.field === "referenceUrl") setStep(3);
        else setStep(5);
      }
    });
  }

  function reroll() {
    if (!card) return;
    const previous = card;
    setError(null);
    setConfirmReroll(false);
    setReady(false);
    setRevealed(false);
    setCard(null);
    setRun((r) => r + 1);
    startTransition(async () => {
      const res = await rerollCard(previous.id);
      if (res.success) {
        setCard(res.data.card);
        setReady(true);
      } else {
        // The old card is untouched, so show it again.
        setError(res.error);
        setCard(previous);
        setReady(true);
      }
    });
  }

  function keep() {
    if (!card) return;
    startTransition(async () => {
      const res = await keepCard(card.id);
      if (res.success) {
        setCard(res.data.card);
        setSaved(true);
      } else {
        setError(res.error);
      }
    });
  }

  // ── No credits ──
  if (mode === "form" && credits <= 0) {
    return (
      <div className={`${panel} space-y-4 text-center`}>
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">You need a card credit</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You earn 1 card credit every time you check in at the track, or 2 with a membership. Check in on your next visit and come back to open a pack.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/track-checkin" className={primary}>
            Check in
          </Link>
          <Link href="/cards" className={secondary}>
            My cards
          </Link>
        </div>
      </div>
    );
  }

  // ── The pack ──
  if (mode === "pack") {
    // Nothing left to decide once a card is final: after its one re-roll, or always while re-rolling is off.
    const finalCard = card?.rerolled || !REROLL_ENABLED;
    return (
      <div className="space-y-4">
        <PackOpening key={run} ready={ready} card={card} bonus={bonus} featured={featured} onRevealed={onRevealed} />

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {revealed && card && (
          <div ref={resultRef} className={`${panel} scroll-mt-20 space-y-4`}>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">You pulled a</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{rarityLabel(card.tier)} card</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{card.name}</p>
              {bonus && (
                <p className="mt-2 text-sm font-bold text-amber-600 dark:text-amber-400">
                  Your pack also had a {rarityLabel(bonus.tier)} card from the community. Swipe the cards above to see it. Both are in
                  your collection.
                </p>
              )}
              {featured && (
                <p className="mt-2 text-sm font-black text-rose-600 dark:text-rose-400">
                  Rare drop! A {rarityLabel(featured.tier)} card, {featured.name}, was also in your pack. Swipe to the last card to see it.
                </p>
              )}
            </div>

            {saved || finalCard ? (
              <div className="space-y-3 text-center">
                <p role="status" className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {finalCard && !saved ? "This is your card. It's in your collection." : "Added to your collection."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/cards" className={credits > 0 ? secondary : primary}>
                    View my cards
                  </Link>
                  {credits > 0 && (
                    <>
                      {/* Same answers as the pack just opened: straight to the next pack. */}
                      <button type="button" className={primary} onClick={open} disabled={pending}>
                        Open another with same settings ({credits} left)
                      </button>
                      <button type="button" className={secondary} onClick={() => { setMode("form"); setStep(1); setCard(null); setError(null); }}>
                        Change settings
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : confirmReroll ? (
              <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Re-roll this card? You will lose this {rarityLabel(card.tier)} card and get a brand new roll, including a new
                  rarity. It could be better or worse, and you can only do this once.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primary} onClick={reroll} disabled={pending}>
                    Yes, re-roll it
                  </button>
                  <button type="button" className={secondary} onClick={() => setConfirmReroll(false)}>
                    Keep this card
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className={primary} onClick={keep} disabled={pending}>
                  {pending ? "Saving…" : "Keep this card"}
                </button>
                <button type="button" className={secondary} onClick={() => setConfirmReroll(true)} disabled={pending}>
                  Re-roll once
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── The form ──
  return (
    <div className="space-y-5">
      {/* Progress */}
      <ol className="flex items-center justify-between gap-1" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n} className="flex flex-1 items-center gap-1" aria-current={active ? "step" : undefined}>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  active ? "bg-amber-500 text-black" : done ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span className={`hidden text-xs font-bold sm:block ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-zinc-200 dark:bg-zinc-800" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className={`${panel} space-y-4`}>
        {step === 1 && (
          <>
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">What name goes on the card?</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">This is printed as the driver. We filled in your account name.</p>
            </div>
            <div>
              <label htmlFor="cp-name" className={label}>Your name</label>
              <input id="cp-name" className={input} value={driver} maxLength={30} autoComplete="name" onChange={(e) => setDriver(e.target.value)} />
            </div>
            <QuickPicks title="Or tap one" options={nameOptions} value={driver} onPick={setDriver} />
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Are you on a team?</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Optional. Tap one, type your own, or skip if you drive solo.</p>
            </div>
            <div>
              <label htmlFor="cp-team" className={label}>Team name</label>
              <input id="cp-team" className={input} value={team} maxLength={30} placeholder="e.g. Penthouse Racing" onChange={(e) => setTeam(e.target.value)} />
            </div>
            <QuickPicks
              title="Or tap one"
              options={[...new Set([...recentTeams, ...COMMON_TEAMS])]}
              value={team}
              onPick={(t) => setTeam((cur) => (cur.trim().toLowerCase() === t.toLowerCase() ? "" : t))}
            />
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Which car is the card of?</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                The art is drawn from a photo of your car, so pick one from your garage or upload a photo.
              </p>
            </div>

            {cars.length > 0 && (
              <fieldset className="space-y-2">
                <legend className={label}>Your garage</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {cars.map((c) => {
                    const active = c.carId === carId;
                    return (
                      <button
                        key={c.carId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseCar(c)}
                        className={`overflow-hidden rounded-xl border-2 text-left ${active ? "border-amber-500" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700"}`}
                      >
                        <span className="block aspect-video bg-zinc-100 dark:bg-zinc-800">
                          {c.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.images[0]} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-xs text-zinc-400">No photo</span>
                          )}
                        </span>
                        <span className="block truncate px-2.5 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-100">{c.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={carId === null}
                    onClick={() => chooseCar(null)}
                    className={`flex min-h-24 items-center justify-center rounded-xl border-2 border-dashed px-2 text-center text-xs font-bold text-zinc-700 dark:text-zinc-200 ${carId === null ? "border-amber-500 bg-amber-500/10" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"}`}
                  >
                    A different car
                  </button>
                </div>
              </fieldset>
            )}

            <div className="space-y-2">
              <p className={label}>Chassis (optional)</p>
              <ChassisSelector value={chassis} onChange={setChassis} />
              {car &&
                (car.chassis.trim() ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Filled in from your garage. You can change it for the card.</p>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {car.name} has no chassis saved in your garage, so we used its name. Pick a chassis above, or{" "}
                    <Link href={`/cars/${car.carId}/edit`} className="font-bold text-amber-600 underline dark:text-amber-400">
                      set the chassis in your garage
                    </Link>{" "}
                    so it fills in every time.
                  </p>
                ))}
            </div>

            <div className="space-y-2">
              <p className={label}>Photo of the car</p>
              {car && car.images.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a photo">
                  {car.images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      aria-pressed={photoUrl === url}
                      aria-label={`Use photo ${i + 1}`}
                      onClick={() => {
                        setPhotoUrl(url);
                        setUploadKey((k) => k + 1);
                      }}
                      className={`h-16 w-24 overflow-hidden rounded-lg border-2 ${photoUrl === url ? "border-amber-500" : "border-transparent"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {/* Always available: take or upload a different photo instead of the garage ones. */}
              <ImageUploader
                key={uploadKey}
                maxFiles={1}
                label={car && car.images.length > 0 ? "Or take / upload a different photo" : "Take or upload a photo of your car"}
                initialUrls={photoUrl && !(car?.images ?? []).includes(photoUrl) ? [photoUrl] : []}
                onUploadComplete={(urls) => {
                  if (urls[0]) setPhotoUrl(urls[0]);
                  else setPhotoUrl(car?.images[0] ?? "");
                }}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Tell us about the car</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Pick the parts in your car and they are printed on the card. Every part is optional, and you can type your own if it
                isn&apos;t listed.
              </p>
            </div>

            <div className="space-y-3">
              {PART_CATEGORIES.map((c) => (
                <PartSelector key={c.key} category={c} value={parts[c.key]} onChange={(v) => setParts((p) => ({ ...p, [c.key as PartKey]: v }))} />
              ))}
            </div>

            <div aria-live="polite" className="space-y-1">
              <p className="flex justify-between text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                <span>On the card</span>
                <span className={`font-semibold normal-case tracking-normal ${partsTooLong ? "text-red-600 dark:text-red-400" : ""}`}>
                  {description.length}/{PARTS_LINE_MAX}
                </span>
              </p>
              <p className="rounded-xl bg-zinc-100 px-3.5 py-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                {description || "Nothing picked yet"}
              </p>
              {partsTooLong && (
                <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
                  That is too long for the card. Shorten a typed part or clear one.
                </p>
              )}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Ready to open your pack?</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                It costs 1 card credit (you have {credits}). Everything on the card is a surprise: its rarity, its art style and its stats.
                Every pack also holds a second card from the community.
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-bold text-zinc-500 dark:text-zinc-400">Driver</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{driver.trim()}</dd>
              <dt className="font-bold text-zinc-500 dark:text-zinc-400">Team</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{team.trim() || "None"}</dd>
              <dt className="font-bold text-zinc-500 dark:text-zinc-400">Car</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{car?.name ?? "Another car"}</dd>
              <dt className="font-bold text-zinc-500 dark:text-zinc-400">Chassis</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{chassis.trim() || "Not set"}</dd>
              {PART_CATEGORIES.map((c) => (
                <Fragment key={c.key}>
                  <dt className="font-bold text-zinc-500 dark:text-zinc-400">{c.label}</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{parts[c.key].trim() || "Not set"}</dd>
                </Fragment>
              ))}
            </dl>
            {REROLL_ENABLED && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                You can re-roll a card once if you want to try again, but you will lose the tier you pulled.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <button type="button" className={secondary} onClick={() => setStep((s) => (s - 1) as Step)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 5 ? (
          <button type="button" className={primary} disabled={!canNext} onClick={() => setStep((s) => (s + 1) as Step)}>
            {(step === 2 && !team.trim()) || (step === 4 && !description.trim()) ? "Skip" : "Next"}
          </button>
        ) : (
          <button type="button" className={primary} disabled={pending || !driver.trim() || !photoUrl} onClick={open}>
            Open my pack
          </button>
        )}
      </div>
    </div>
  );
}
