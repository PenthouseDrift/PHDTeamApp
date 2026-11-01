import type { CSSProperties } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { FullArtCardData } from "@/lib/full-art-card";

/**
 * A trading card booster pack: a foil wrapper with crimped (serrated) top and bottom seals, side fold
 * shading, a sheen that slides across on hover, a hero (a card or the logo) and a name ribbon.
 * Pure CSS, sized by its container (`cqw` units), so it scales from a small tile to a big shelf pack.
 */

interface Foil {
  /** The wrapper's metallic body. */
  body: string;
  /** Crimp seal bands, ribbon and text accents. */
  accent: string;
  accentDark: string;
  /** Ink on the ribbon. */
  ribbonText: string;
  glow: string;
}

const STANDARD_FOIL: Foil = {
  body: "linear-gradient(162deg,#2b2112 0%,#0c0a07 38%,#171008 62%,#33260f 100%)",
  accent: "#f5b324",
  accentDark: "#8a5a06",
  ribbonText: "#1a1204",
  glow: "245,158,11",
};

const CUSTOM_FOILS: Foil[] = [
  { body: "linear-gradient(162deg,#1d2b55 0%,#0a0f26 40%,#12183a 62%,#26357a 100%)", accent: "#7aa2ff", accentDark: "#2c4aa6", ribbonText: "#06102e", glow: "96,140,255" },
  { body: "linear-gradient(162deg,#3b1456 0%,#12061d 40%,#1c0a2c 62%,#5a1f86 100%)", accent: "#d28bff", accentDark: "#6f2ba3", ribbonText: "#1a0629", glow: "190,110,255" },
  { body: "linear-gradient(162deg,#0f3b34 0%,#04120f 40%,#08201b 62%,#146a5c 100%)", accent: "#4fe3c1", accentDark: "#117a63", ribbonText: "#03150f", glow: "60,220,185" },
  { body: "linear-gradient(162deg,#4a1218 0%,#150508 40%,#220a0e 62%,#7a1f2a 100%)", accent: "#ff7b86", accentDark: "#9c1f2c", ribbonText: "#2a0509", glow: "255,100,115" },
  { body: "linear-gradient(162deg,#46260a 0%,#140a02 40%,#241205 62%,#7a4510 100%)", accent: "#ffb065", accentDark: "#9a5413", ribbonText: "#241002", glow: "255,160,80" },
  { body: "linear-gradient(162deg,#123a4a 0%,#041117 40%,#08202a 62%,#17627d 100%)", accent: "#6fd8ff", accentDark: "#1a6a8a", ribbonText: "#02141c", glow: "90,200,255" },
];

/** The same name always gets the same colour. */
function foilFor(seed: string): Foil {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CUSTOM_FOILS[h % CUSTOM_FOILS.length];
}

/**
 * The wrapper outline, with a serrated edge along the top and bottom. Percentages of a 5:8 pack, so
 * the teeth are the same size on every pack.
 */
const TEETH = 18;
const TOOTH = 1.3; // tooth depth, % of the pack's height
function wrapperClip(): string {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH; i++) pts.push(`${((i / TEETH) * 100).toFixed(2)}% ${i % 2 === 0 ? 0 : TOOTH}%`);
  for (let i = TEETH; i >= 0; i--) pts.push(`${((i / TEETH) * 100).toFixed(2)}% ${i % 2 === 0 ? 100 : 100 - TOOTH}%`);
  return `polygon(${pts.join(",")})`;
}
const CLIP = wrapperClip();

const CRIMP_RIDGES =
  "repeating-linear-gradient(90deg,rgba(255,255,255,0.30) 0 0.7cqw,rgba(0,0,0,0.32) 0.7cqw 1.5cqw)";

export function PackArt({
  name,
  variant,
  cardsLabel,
  extraLabel,
  heroCard,
  discountPct,
  bare,
  className,
}: {
  name: string;
  variant: "standard" | "custom";
  /** e.g. "3 CARDS" */
  cardsLabel: string;
  /** A smaller line under the card count, e.g. "+ RARE CHANCE". */
  extraLabel?: string;
  /** A card shown on the front of the pack. Without one, the logo is. */
  heroCard?: FullArtCardData;
  /** Shown as a red sale burst when above 0. */
  discountPct?: number;
  /** No drop shadow or glow, for when something around the pack draws them (e.g. the pack opening, which cuts the pack in two). */
  bare?: boolean;
  className?: string;
}) {
  const foil = variant === "standard" ? STANDARD_FOIL : foilFor(name);
  const accentGradient = `linear-gradient(180deg,${foil.accent} 0%,${foil.accentDark} 55%,${foil.accent} 100%)`;
  const bandStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: "9cqw",
    background: `${CRIMP_RIDGES}, ${accentGradient}`,
    backgroundBlendMode: "overlay, normal",
  };
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "5 / 8",
        containerType: "inline-size",
        filter: bare ? undefined : `drop-shadow(0 1.6cqw 2.4cqw rgba(0,0,0,0.55)) drop-shadow(0 0 3cqw rgba(${foil.glow},0.14))`,
      }}
    >
      <div
        className="group/pack"
        style={{
          position: "absolute",
          inset: 0,
          clipPath: CLIP,
          background: foil.body,
          overflow: "hidden",
          color: "#fff",
        }}
      >
        {/* Foil glow behind the hero */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 70% 45% at 50% 46%, rgba(${foil.glow},0.42), transparent 70%)`,
          }}
        />
        {/* Light rays */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "-25%",
            top: "6%",
            width: "150%",
            height: "62%",
            background: `repeating-conic-gradient(from 0deg at 50% 50%, rgba(${foil.glow},0.20) 0deg 6deg, transparent 6deg 18deg)`,
            maskImage: "radial-gradient(circle at 50% 50%, #000 0%, transparent 62%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 0%, transparent 62%)",
          }}
        />

        {/* Top and bottom crimped seals */}
        <div aria-hidden style={{ ...bandStyle, top: 0, borderBottom: "0.5cqw solid rgba(0,0,0,0.45)" }} />
        <div aria-hidden style={{ ...bandStyle, bottom: 0, borderTop: "0.5cqw solid rgba(0,0,0,0.45)" }} />

        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: "9cqw 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5cqw 8cqw 6cqw",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "5.2cqw",
                fontWeight: 900,
                letterSpacing: "0.34em",
                color: foil.accent,
                textShadow: "0 0.3cqw 0.8cqw rgba(0,0,0,0.8)",
                paddingLeft: "0.34em",
              }}
            >
              PENTHOUSE DRIFT
            </div>
            <div style={{ fontSize: "3.6cqw", fontWeight: 800, letterSpacing: "0.3em", opacity: 0.75, paddingLeft: "0.3em" }}>
              {variant === "standard" ? "TANDEM CLASH" : "LIMITED SET"}
            </div>
          </div>

          {/* Hero */}
          <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: "3cqw 0" }}>
            {heroCard ? (
              <div style={{ width: "41cqw", transform: "rotate(-4deg)", filter: "drop-shadow(0 1.4cqw 2cqw rgba(0,0,0,0.7))" }}>
                <FullArtCard card={heroCard} flat />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo.png" alt="" style={{ width: "58cqw", filter: "drop-shadow(0 1.2cqw 2cqw rgba(0,0,0,0.7))" }} />
            )}
          </div>

          {/* Name ribbon */}
          <div style={{ width: "100%", textAlign: "center" }}>
            <div
              style={{
                background: accentGradient,
                color: foil.ribbonText,
                padding: "2.4cqw 4cqw",
                borderRadius: "1.2cqw",
                transform: "skewX(-6deg)",
                boxShadow: "0 1cqw 1.6cqw rgba(0,0,0,0.5), inset 0 0.4cqw 0 rgba(255,255,255,0.45)",
              }}
            >
              <div
                style={{
                  transform: "skewX(6deg)",
                  fontSize: "7.4cqw",
                  fontWeight: 900,
                  lineHeight: 1.05,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  overflowWrap: "anywhere",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {name}
              </div>
            </div>
            <div
              style={{
                marginTop: "3.2cqw",
                display: "inline-block",
                border: `0.5cqw solid ${foil.accent}`,
                borderRadius: "99cqw",
                padding: "1cqw 4.4cqw",
                fontSize: "4.4cqw",
                fontWeight: 900,
                letterSpacing: "0.14em",
                color: foil.accent,
                background: "rgba(0,0,0,0.45)",
              }}
            >
              {cardsLabel}
            </div>
            {extraLabel && (
              <div
                style={{
                  marginTop: "2cqw",
                  fontSize: "3.4cqw",
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  color: foil.accent,
                  opacity: 0.85,
                  paddingLeft: "0.16em",
                }}
              >
                {extraLabel}
              </div>
            )}
          </div>
        </div>

        {/* Side folds */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg,rgba(0,0,0,0.55) 0%,rgba(255,255,255,0.14) 3.5%,transparent 9%,transparent 91%,rgba(255,255,255,0.12) 96.5%,rgba(0,0,0,0.55) 100%)",
          }}
        />
        {/* Foil sheen: sweeps across on hover (still when the user prefers less motion) */}
        <div
          aria-hidden
          className="transition-transform duration-700 ease-out group-hover/pack:translate-x-[18%] motion-reduce:transition-none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "-60%",
            width: "220%",
            background:
              "linear-gradient(112deg,transparent 38%,rgba(255,255,255,0.05) 42%,rgba(255,255,255,0.34) 49%,rgba(255,255,255,0.05) 56%,transparent 60%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {discountPct && discountPct > 0 ? (
        <span
          style={{
            position: "absolute",
            right: "-3cqw",
            top: "24cqw",
            transform: "rotate(10deg)",
            background: "#e11d48",
            color: "#fff",
            fontSize: "6.4cqw",
            fontWeight: 900,
            padding: "1.4cqw 3.6cqw",
            borderRadius: "99cqw",
            boxShadow: "0 1cqw 2cqw rgba(0,0,0,0.5)",
            border: "0.5cqw solid rgba(255,255,255,0.7)",
          }}
        >
          -{discountPct}%
        </span>
      ) : null}
    </div>
  );
}
