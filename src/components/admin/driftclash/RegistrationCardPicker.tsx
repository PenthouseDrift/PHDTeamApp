"use client";

import { useEffect, useMemo, useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { FullArtTier } from "@/lib/full-art-card";
import type { EntryVariant } from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import {
  listRegistrationCardSourcesAction,
  type RegistrationCardCar,
  type RegistrationCardSource,
} from "@/actions/admin/driftclash-registrations";
import type { SetCard } from "@/components/admin/driftclash/PackEditor";
import { UploadedCardForm } from "@/components/admin/driftclash/StyleCardWizard";
import { inputCls, labelCls, secondaryBtn, stylePreviewCard, tierLabel } from "@/components/admin/driftclash/preview";

/** One of a registration's forms: a car, or the club. */
type FormChoice = { kind: "car"; carId: string } | { kind: "club" };

/** A picture to pick, with where it came from. */
interface Picture {
  url: string;
  caption: string;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

const rowBtn =
  "flex w-full items-center gap-3 rounded-xl border border-zinc-300 p-2.5 text-left transition-colors hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-zinc-700";

function firstPicture(source: RegistrationCardSource): string {
  return source.cars[0]?.photos[0] ?? source.cars[0]?.chassisPhotos[0] ?? source.club?.logo ?? source.club?.photos[0] ?? "";
}

/**
 * The card's description line: the car's electronics in the order they're shown on the card, "Motor · ESC · Gyro · Servo".
 * Anything left blank on the registration is skipped. (The registration form has no controller field yet.) With none of them
 * filled in, the car's notes are used instead.
 */
function partsLine(car: RegistrationCardCar): string {
  const parts = [car.motor, car.esc, car.gyro, car.servo].map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : car.notes.trim();
}

function carPictures(car: RegistrationCardCar): Picture[] {
  return [
    ...car.photos.map((url, i) => ({ url, caption: `Car photo ${i + 1}` })),
    ...car.chassisPhotos.map((url, i) => ({ url, caption: `Chassis photo ${i + 1}` })),
  ];
}

function clubPictures(club: NonNullable<RegistrationCardSource["club"]>): Picture[] {
  return [
    ...(club.logo ? [{ url: club.logo, caption: "Club logo" }] : []),
    ...club.photos.map((url, i) => ({ url, caption: `Club photo ${i + 1}` })),
  ];
}

/** A small picture that is only decoration (the button or text next to it says what it is). */
function Thumb({ url, className = "h-12 w-12" }: { url: string; className?: string }) {
  if (!url) return <span aria-hidden className={`${className} shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-800`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" className={`${className} shrink-0 rounded-lg object-cover`} />;
}

/**
 * Make a card from someone's DriftClash registration, in four picks: the registration, one of its forms (a car, or the
 * club), one of the pictures they uploaded there, and a card style. Then the same form as "my own picture" finishes it, with
 * the name, chassis, driver and team already filled in from the registration (all editable).
 */
export function RegistrationCardPicker({
  tier,
  styles,
  onCardAdded,
}: {
  tier: FullArtTier;
  styles: PackStyle[];
  /** A card was saved; add it to the rarity. `variant` is what the entry keeps (reroll at the pull). */
  onCardAdded: (card: SetCard, variant: EntryVariant | undefined) => void;
}) {
  const [sources, setSources] = useState<RegistrationCardSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [regId, setRegId] = useState<string | null>(null);
  const [form, setForm] = useState<FormChoice | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRegistrationCardSourcesAction()
      .then((res) => {
        if (cancelled) return;
        if (res.success) setSources(res.data);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the registrations");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reg = sources?.find((s) => s.id === regId) ?? null;
  const car = reg && form?.kind === "car" ? (reg.cars.find((c) => c.id === form.carId) ?? null) : null;
  const club = reg && form?.kind === "club" ? reg.club : null;
  const pictures = car ? carPictures(car) : club ? clubPictures(club) : [];
  const style = styles.find((s) => s.id === styleId) ?? null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!sources) return [];
    if (!q) return sources;
    return sources.filter((s) =>
      [s.driverName, s.nickname, s.club?.name ?? "", ...s.cars.map((c) => c.label)].join(" ").toLowerCase().includes(q)
    );
  }, [sources, query]);

  // Going back to an earlier step clears the picks after it.
  const pickRegistration = (id: string | null) => {
    setRegId(id);
    setForm(null);
    setPicture(null);
    setStyleId(null);
  };
  const pickForm = (next: FormChoice | null) => {
    setForm(next);
    setPicture(null);
    setStyleId(null);
  };
  const pickPicture = (url: string | null) => {
    setPicture(url);
    setStyleId(null);
  };

  if (error) return <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>;
  if (!sources) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading registrations…</p>;

  // What the card starts with, from the car (or the club) and the person.
  const details = reg
    ? {
        // The card's own limits: name 40, chassis 48, description 160, driver 30, team 30.
        name: (car ? `${car.make} ${car.model}`.trim() : (club?.name ?? "")).slice(0, 40),
        ability: (car?.chassis ?? "").slice(0, 48),
        effect: (car ? partsLine(car) : "").slice(0, 160),
        driver: (reg.nickname || reg.driverName).slice(0, 30),
        team: (reg.club?.name ?? "").slice(0, 30),
      }
    : undefined;

  const crumb = (label: string, value: string, onClear: () => void) => (
    <button type="button" onClick={onClear} className={`${secondaryBtn} max-w-full gap-1.5`} aria-label={`${label}: ${value}. Change it`}>
      <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
      <span className="truncate">{value}</span>
      <span aria-hidden>✕</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Make a {tierLabel(tier)} card from a registration: pick the person, one of their forms, one of the pictures they uploaded and a
        style. The picture is copied into the app, so it is safe if the registration changes later.
      </p>

      {(reg || form || picture || style) && (
        <div className="flex flex-wrap gap-2" aria-label="Your choices so far">
          {reg && crumb("Registration", reg.driverName || "Unnamed", () => pickRegistration(null))}
          {form && crumb("Form", car ? car.label : "Club", () => pickForm(null))}
          {picture && crumb("Picture", "chosen", () => pickPicture(null))}
          {style && crumb("Style", style.name, () => setStyleId(null))}
        </div>
      )}

      {/* 1. Registration */}
      {!reg && (
        <div className="space-y-3">
          <div>
            <label htmlFor="reg-search" className={labelCls}>
              Registration
            </label>
            <input
              id="reg-search"
              className={inputCls}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, club or car"
            />
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No registration has a picture that can be used yet.</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No registrations match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Registrations">
              {shown.map((s) => (
                <li key={s.id}>
                  <button type="button" className={rowBtn} onClick={() => pickRegistration(s.id)}>
                    <Thumb url={firstPicture(s)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">
                        {s.driverName || "Unnamed"}
                        {s.nickname ? ` “${s.nickname}”` : ""}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {[s.club?.name, `${s.cars.length} car${s.cars.length === 1 ? "" : "s"}`, dateFmt.format(new Date(s.createdAt))]
                          .filter(Boolean)
                          .join(" · ")}
                        {s.guest ? " · guest" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 2. Form */}
      {reg && !form && (
        <div className="space-y-3">
          <p className={labelCls}>Which form?</p>
          {!reg.consentGameData && (
            <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              This person has not said their details can be used in the game. Check with them before using their pictures.
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Forms in this registration">
            {reg.cars.map((c, i) => (
              <li key={c.id}>
                <button type="button" className={rowBtn} onClick={() => pickForm({ kind: "car", carId: c.id })}>
                  <Thumb url={c.photos[0] ?? c.chassisPhotos[0] ?? ""} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{c.label || `Car ${i + 1}`}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      Car {i + 1} · {c.photos.length + c.chassisPhotos.length} picture{c.photos.length + c.chassisPhotos.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {reg.club && (
              <li>
                <button type="button" className={rowBtn} onClick={() => pickForm({ kind: "club" })}>
                  <Thumb url={reg.club.logo || reg.club.photos[0] || ""} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{reg.club.name || "Club"}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      Club · {clubPictures(reg.club).length} picture{clubPictures(reg.club).length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 3. Picture */}
      {reg && form && !picture && (
        <div className="space-y-3">
          <p className={labelCls}>Which picture?</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Uploaded pictures">
            {pictures.map((p) => (
              <li key={p.url}>
                <button
                  type="button"
                  onClick={() => pickPicture(p.url)}
                  aria-label={`Use ${p.caption}`}
                  className="block w-full overflow-hidden rounded-xl border border-zinc-300 text-left hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-zinc-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <span className="block px-2 py-1 text-xs font-bold">{p.caption}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Style */}
      {reg && form && picture && !style && (
        <div className="space-y-3">
          <p className={labelCls}>Which style?</p>
          {styles.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No styles yet. Create one on the Styles tab.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {styles.map((s) => (
                <button key={s.id} type="button" onClick={() => setStyleId(s.id)} aria-label={`Choose style ${s.name}`} className="w-28 text-left">
                  <FullArtCard card={stylePreviewCard(s, tier)} />
                  <span className="mt-1 block truncate text-xs font-bold">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. The card */}
      {reg && form && picture && style && (
        <UploadedCardForm
          key={`${reg.id}|${car?.id ?? "club"}|${picture}|${style.id}`}
          tier={tier}
          style={style}
          fixedPicture={picture}
          initialDetails={details}
          onCardAdded={onCardAdded}
        />
      )}
    </div>
  );
}
