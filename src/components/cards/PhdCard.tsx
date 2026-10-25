"use client";

import { useId } from "react";
import { Barlow_Condensed } from "next/font/google";
import { darken, lighten, mix, type CardData } from "@/lib/card-maker";

const cardFont = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"] });

/**
 * The PHD trading card. Everything is sized in `cqw` (1% of the card's own
 * width) so the same markup renders crisply at any size: a small preview on
 * a phone, a big one on desktop, or exactly 63mm wide (Pokémon card size) when printed.
 * Colours come from three theme values; the metal tones are derived from the
 * accent so one colour pick restyles the whole bezel and name plate.
 */

// Contoured bezel outline in card units (100 x 140): corners are chamfered, the sides step
// in around the picture, and the bottom edge lifts in the middle behind the name plate.
const BEZEL_OUTER =
  "M9 3.2 H91 L96.8 9 V44 L94.8 46 V99 L96.8 101 V129.4 L91 135.8 H80.4 L76.2 133.5 H23.8 L19.6 135.8 H9 L3.2 129.4 V101 L5.2 99 V46 L3.2 44 V9 Z";
const BEZEL_INNER =
  "M10.8 5 H89.2 L95 10.8 V44.4 L93.1 46.3 V98.7 L95 100.6 V128.6 L90.2 133.9 H81.2 L77.2 131.6 H22.8 L18.8 133.9 H9.8 L5 128.6 V100.6 L6.9 98.7 V46.3 L5 44.4 V10.8 Z";
// The name plate is clipped to the same shape as the inside of the bezel.
const plateClip = "polygon(0 0, 100% 0, 100% 72.9%, 94.9% 92.8%, 84.8% 92.8%, 80.4% 84.2%, 19.6% 84.2%, 15.2% 92.8%, 5.1% 92.8%, 0 72.9%)";
// Hex mesh strip follows the chamfered top corners of the bezel.
const meshClip = "polygon(6.25% 0, 93.75% 0, 100% 46%, 100% 100%, 0 100%, 0 46%)";

// ── Header badge geometry ───────────────────────────────────────────────────
// Drawn as SVG polygons (not clip-paths) so the rim is a true, even-width bevel and the
// drop shadow follows the real outline. Inset polygons are computed, not eyeballed.
const BADGE_W = 52;
const BADGE_H = 21.2;
type Pt = [number, number];

const BADGE_OUTER: Pt[] = [
  [BADGE_W * 0.11, 0],
  [BADGE_W * 0.89, 0],
  [BADGE_W, BADGE_H / 2],
  [BADGE_W * 0.89, BADGE_H],
  [BADGE_W * 0.11, BADGE_H],
  [0, BADGE_H / 2],
];

/** Move every edge of a convex polygon inwards by d and re-join the corners. */
function insetPolygon(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / n;
  const cy = pts.reduce((sum, p) => sum + p[1], 0) / n;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / len;
    let ny = dx / len;
    if ((cx - (p[0] + q[0]) / 2) * nx + (cy - (p[1] + q[1]) / 2) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { px: p[0] + nx * d, py: p[1] + ny * d, dx, dy };
  });
  return pts.map((_, i) => {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const det = a.dx * b.dy - a.dy * b.dx;
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
    return [a.px + a.dx * t, a.py + a.dy * t] as Pt;
  });
}

const pointsAttr = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(" ");
const BADGE_RIM = 1.9; // rim thickness
const BADGE_FACE = insetPolygon(BADGE_OUTER, BADGE_RIM);
const BADGE_BEVEL = insetPolygon(BADGE_OUTER, 0.55);

// The supplied PHD logo (public/): dark lettering for the white badge, light lettering for the dark one.
const LOGO_SRC = "/phd-logo.png";
const LOGO_LIGHT_SRC = "/phd-logo-light.png";

// Logo size inside the badge (card-width units). The PNG is 1410 x 455 and trimmed to the lettering.
const LOGO_W = 34;
const LOGO_H = (LOGO_W * 455) / 1410;
const LOGO_OUTLINE_W = 0.2;

const shieldClip = "polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)";

export function PhdCard({
  card,
  className,
  placeholders = false,
  flat = false,
}: {
  card: CardData;
  className?: string;
  /** Show "[Ability]" / "[Effect]" hints in empty fields (editor preview only, never printed). */
  placeholders?: boolean;
  /** Print mode: drop the on-screen edge ring so nothing grey is printed around the card. */
  flat?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const { accent, body, text } = card.theme;

  const aLight = lighten(accent, 0.45);
  const aPale = lighten(accent, 0.72);
  const aDark = darken(accent, 0.42);
  const bodyDeep = darken(body, 0.35);
  const shaded = card.backgroundShading;
  const bodyLift = mix(body, "#ffffff", 0.1);

  const metal = `linear-gradient(135deg, ${aLight} 0%, ${accent} 28%, ${aDark} 52%, ${accent} 74%, ${aLight} 100%)`;
  // Brushed-metal highlight: a soft bright band across the plate, like the template.
  const plateSheen = "linear-gradient(100deg, rgba(255,255,255,0) 8%, rgba(255,255,255,0.38) 45%, rgba(255,255,255,0) 82%)";
  const plate = `linear-gradient(180deg, ${aPale} 0%, ${aLight} 38%, ${accent} 100%)`;

  // "body": the badge face takes the card body colour. The lettering (black / white) is chosen separately.
  const darkFace = card.logoStyle === "body";
  const shownLogo = card.logoTone === "white" ? LOGO_LIGHT_SRC : LOGO_SRC;
  const faceTop = darkFace ? lighten(body, 0.08) : "#f1f1f1";
  const faceMid = darkFace ? mix(body, "#ffffff", 0.04) : "#ffffff";
  const faceBottom = darkFace ? darken(body, 0.25) : "#ffffff";

  const name = card.name.trim() || "CAR NAME";
  // Long names step down in size so they stay on one line.
  const nameSize = Math.max(5, 8.6 - Math.max(0, name.length - 12) * 0.25);

  const statEntries: Array<[string, string]> = [
    ["Drift", card.stats.drift],
    ["Accel", card.stats.accel],
    ["Grip", card.stats.grip],
    ["Steer", card.stats.steer],
  ];

  const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", ...style });

  return (
    <div
      className={`${cardFont.className} ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "63 / 88",
        containerType: "inline-size",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div
        style={{
          ...abs({ inset: 0 }),
          borderRadius: "5cqw",
          overflow: "hidden",
          background: shaded ? `radial-gradient(120% 90% at 50% 20%, ${bodyLift} 0%, ${body} 55%, ${bodyDeep} 100%)` : body,
          boxShadow: flat ? "none" : "0 0 0 0.25cqw rgba(0,0,0,0.5)",
        }}
      >
        {/* Frame: black body detail, circuit traces, and a contoured, brushed-metal bezel
            whose outline steps in around the image and chamfers at the corners. */}
        <svg viewBox="0 0 100 140" style={abs({ inset: 0, width: "100%", height: "100%" })} aria-hidden>
          <defs>
            <linearGradient id={`metal-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="140">
              <stop offset="0" stopColor={aLight} />
              <stop offset="0.28" stopColor={accent} />
              <stop offset="0.52" stopColor={aDark} />
              <stop offset="0.74" stopColor={accent} />
              <stop offset="1" stopColor={aLight} />
            </linearGradient>
            <linearGradient id={`field-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={bodyDeep} />
              <stop offset="1" stopColor={body} />
            </linearGradient>
            <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.62" stopColor="#fff" stopOpacity="0.07" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id={`brush-${uid}`} filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="140">
              <feTurbulence type="fractalNoise" baseFrequency="0.02 1.5" numOctaves="2" seed="4" />
              <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 -0.12" />
            </filter>
            <clipPath id={`bezel-${uid}`}>
              <path d={`${BEZEL_OUTER} ${BEZEL_INNER}`} clipRule="evenodd" />
            </clipPath>
          </defs>

          <path d={BEZEL_INNER} fill={shaded ? `url(#field-${uid})` : body} />
          {shaded && <rect width="100" height="140" fill={`url(#sheen-${uid})`} />}

          {/* Circuit traces in the black margin */}
          <g fill="none" stroke={aDark} strokeWidth="0.32" opacity="0.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.7 12 V30 L3 31.3" />
            <path d="M98.3 12 V30 L97 31.3" />
            <path d="M1.7 50 V72 L3.4 73.7 V92" />
            <path d="M98.3 52 V70 L96.6 71.7 V94" />
            <path d="M1.7 104 V122 L3.4 124" />
            <path d="M98.3 102 V120 L96.6 122" />
            <path d="M11 138.2 H32 L34.2 136.9" />
            <path d="M89 138.2 H68 L65.8 136.9" />
            <path d="M40 138.4 H60" />
          </g>
          <g fill="none" stroke={aDark} strokeWidth="0.32" opacity="0.75">
            <circle cx="1.7" cy="50" r="0.85" />
            <circle cx="98.3" cy="52" r="0.85" />
            <circle cx="11" cy="138.2" r="0.8" />
            <circle cx="89" cy="138.2" r="0.8" />
          </g>

          {/* Bezel, brushed streaks, then edge highlights */}
          <path d={`${BEZEL_OUTER} ${BEZEL_INNER}`} fillRule="evenodd" fill={`url(#metal-${uid})`} />
          <g clipPath={`url(#bezel-${uid})`}>
            <rect width="100" height="140" filter={`url(#brush-${uid})`} />
          </g>
          <path d={BEZEL_OUTER} fill="none" stroke={aPale} strokeWidth="0.3" opacity="0.9" strokeLinejoin="round" />
          <path d={BEZEL_INNER} fill="none" stroke={aDark} strokeWidth="0.4" strokeLinejoin="round" />
        </svg>

        {/* Hex mesh behind the header badge */}
        <svg viewBox="0 0 90 13" preserveAspectRatio="none" style={{ ...abs({ left: "5.2cqw", top: "4.8cqw", width: "89.6cqw", height: "13cqw" }), clipPath: meshClip }} aria-hidden>
          <defs>
            <pattern id={`hex-${uid}`} width="6" height="10.4" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
              <path d="M3 0 L6 1.73 V5.2 L3 6.93 L0 5.2 V1.73 Z M3 6.93 L3 10.4" fill="none" stroke={accent} strokeWidth="0.35" opacity="0.55" />
            </pattern>
          </defs>
          <rect width="90" height="13" fill={`url(#hex-${uid})`} />
        </svg>
        <div style={abs({ left: "5.2cqw", right: "5.2cqw", top: "17cqw", height: "1.1cqw", background: metal, boxShadow: `inset 0 0.25cqw 0 ${aPale}, inset 0 -0.2cqw 0 ${aDark}` })} />

        {/* Image window */}
        <div
          style={{
            ...abs({ left: "7.4cqw", right: "7.4cqw", top: "18cqw", height: "80cqw" }),
            background: "#d2d0cd",
            border: `0.9cqw solid ${aLight}`,
            borderRadius: "0.8cqw",
            overflow: "hidden",
            boxShadow: `inset 0 0 0 0.25cqw ${aDark}`,
          }}
        >
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt={card.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${card.imageX}% ${card.imageY}%`,
                transform: `scale(${card.imageZoom / 100})`,
                transformOrigin: `${card.imageX}% ${card.imageY}%`,
                display: "block",
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9894", fontSize: "9cqw", fontWeight: 800, textAlign: "center", lineHeight: 1 }}>
              PLACE IMAGE HERE
            </div>
          )}

          {/* Driver / team overlay */}
          {(card.driver.trim() || card.team.trim() || placeholders) && (
            <div
              style={{
                ...abs({ left: "2.4cqw", right: "2.4cqw", bottom: "2cqw" }),
                color: card.overlayColour,
                fontWeight: 800,
                textTransform: "uppercase",
                lineHeight: 1.1,
                letterSpacing: "0.03em",
                textShadow: "0 0.2cqw 0.8cqw rgba(0,0,0,0.9), 0 0 0.3cqw rgba(0,0,0,0.8)",
                pointerEvents: "none",
              }}
            >
              {(card.driver.trim() || placeholders) && (
                <div style={{ fontSize: "4.6cqw", opacity: card.driver.trim() ? 1 : 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ fontSize: "3.2cqw", opacity: 0.85 }}>Driver: </span>
                  {card.driver.trim() || "[Name]"}
                </div>
              )}
              {(card.team.trim() || placeholders) && (
                <div style={{ fontSize: "4.6cqw", opacity: card.team.trim() ? 1 : 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ fontSize: "3.2cqw", opacity: 0.85 }}>Team: </span>
                  {card.team.trim() || "[Name]"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Header badge: hexagon with a metal rim and a white face */}
        {/* Header badge. The drop shadow sits on this wrapper so it follows the outline and
            falls onto the picture; the badge hangs over the top of the image. */}
        <div
          style={{
            ...abs({ left: "24cqw", top: "2.2cqw", width: `${BADGE_W}cqw`, height: `${BADGE_H}cqw` }),
            filter: flat
              ? "drop-shadow(0 0.7cqw 0.6cqw rgba(0,0,0,0.5)) drop-shadow(0 1.4cqw 1.4cqw rgba(0,0,0,0.3))"
              : "drop-shadow(0 0.8cqw 0.6cqw rgba(0,0,0,0.6)) drop-shadow(0 1.8cqw 1.8cqw rgba(0,0,0,0.4))",
          }}
        >
          <svg viewBox={`0 0 ${BADGE_W} ${BADGE_H}`} style={abs({ inset: 0, width: "100%", height: "100%", overflow: "visible" })} aria-hidden>
            <defs>
              <linearGradient id={`bmetal-${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={aPale} />
                <stop offset="0.25" stopColor={aLight} />
                <stop offset="0.5" stopColor={accent} />
                <stop offset="0.75" stopColor={aDark} />
                <stop offset="1" stopColor={aLight} />
              </linearGradient>
              <linearGradient id={`bface-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={faceTop} />
                <stop offset="0.18" stopColor={faceMid} />
                <stop offset="1" stopColor={faceBottom} />
              </linearGradient>
              <pattern id={`bhex-${uid}`} width="6" height="10.4" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
                <path d="M3 0 L6 1.73 V5.2 L3 6.93 L0 5.2 V1.73 Z M3 6.93 L3 10.4" fill="none" stroke={darkFace ? accent : aDark} strokeWidth="0.35" opacity={darkFace ? 0.55 : 0.3} />
              </pattern>
              <clipPath id={`bclip-${uid}`}>
                <polygon points={pointsAttr(BADGE_FACE)} />
              </clipPath>
              {/* Outline: grow the lettering's alpha outwards, colour it, and put the logo on top. */}
              <filter id={`bline-${uid}`} x="-8%" y="-30%" width="116%" height="160%">
                <feMorphology in="SourceAlpha" operator="dilate" radius={LOGO_OUTLINE_W} result="grown" />
                <feFlood floodColor={card.logoOutlineColour} result="paint" />
                <feComposite in="paint" in2="grown" operator="in" result="line" />
                <feMerge>
                  <feMergeNode in="line" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polygon points={pointsAttr(BADGE_OUTER)} fill={`url(#bmetal-${uid})`} strokeLinejoin="round" />
            <polygon points={pointsAttr(BADGE_BEVEL)} fill="none" stroke={aPale} strokeWidth="0.28" opacity="0.85" strokeLinejoin="round" />
            <polygon points={pointsAttr(BADGE_FACE)} fill={`url(#bface-${uid})`} />
            <polygon points={pointsAttr(BADGE_FACE)} fill={`url(#bhex-${uid})`} />
            <polygon points={pointsAttr(BADGE_FACE)} fill="none" stroke={aDark} strokeWidth="0.35" strokeLinejoin="round" />
            {/* Logo: a transparent PNG trimmed to the lettering, centred and clipped to the face so it never covers the rim. */}
            <g clipPath={`url(#bclip-${uid})`}>
              <image
                href={shownLogo}
                x={(BADGE_W - LOGO_W) / 2}
                y={(BADGE_H - LOGO_H) / 2}
                width={LOGO_W}
                height={LOGO_H}
                preserveAspectRatio="xMidYMid meet"
                filter={card.logoOutline ? `url(#bline-${uid})` : undefined}
              />
            </g>
          </svg>

        </div>

        {/* Stats bar */}
        <div
          style={{
            ...abs({ left: "5.2cqw", right: "5.2cqw", top: "99.6cqw", height: "9.2cqw" }),
            // Follows the bezel's stepped corners at the top of the bar.
            clipPath: "polygon(1.1cqw 0, calc(100% - 1.1cqw) 0, 100% 1.2cqw, 100% 100%, 0 100%, 0 1.2cqw)",
            background: `linear-gradient(180deg, #000, ${bodyDeep})`,
            borderTop: `0.5cqw solid ${aDark}`,
            borderBottom: `0.5cqw solid ${aDark}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "0 2cqw",
          }}
        >
          {statEntries.map(([label, value]) => (
            <span key={label} style={{ fontSize: "5.2cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: accent, whiteSpace: "nowrap" }}>
              {label}: <span style={{ color: aPale }}>{value.trim() || "__"}</span>
            </span>
          ))}
        </div>

        {/* Name plate */}
        <div
          style={{
            ...abs({ left: "5.2cqw", right: "5.2cqw", top: "109.2cqw", height: "26.6cqw" }),
            background: `${plateSheen}, ${plate}`,
            clipPath: plateClip,
          }}
        >
          <div
            style={{
              ...abs({ left: "19cqw", right: "19cqw", top: "1.1cqw" }),
              textAlign: "center",
              color: text,
              fontWeight: 800,
              fontSize: `${nameSize}cqw`,
              textTransform: "uppercase",
              lineHeight: 1.05,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div style={{ ...abs({ left: "18.5cqw", right: "18cqw", top: "10.3cqw" }), color: text, fontWeight: 700, fontSize: "3.3cqw", lineHeight: 1.1 }}>
            {(card.ability.trim() || placeholders) && (
              <div style={{ color: darken(accent, 0.28), opacity: card.ability.trim() ? 1 : 0.75, display: "flex", gap: "1cqw", whiteSpace: "nowrap", overflow: "hidden" }}>
                <span aria-hidden>•</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{card.ability.trim() || "[Ability / Chassis Type]"}</span>
              </div>
            )}
            {(card.effect.trim() || placeholders) && (
              <div style={{ display: "flex", gap: "1cqw", opacity: card.effect.trim() ? 1 : 0.55 }}>
                <span aria-hidden>•</span>
                <span style={{ display: "-webkit-box", WebkitLineClamp: card.ability.trim() || placeholders ? 2 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {card.effect.trim() || "[Effect description text / Flavour text goes here]"}
                </span>
              </div>
            )}
          </div>

          {/* Tier / spec shield */}
          <div style={{ ...abs({ left: "2.4cqw", top: "50%", width: "12.4cqw", height: "17.4cqw" }), transform: "translateY(-50%)", clipPath: shieldClip, background: `linear-gradient(135deg, ${aLight}, ${aDark})` }}>
            <div
              style={{
                ...abs({ left: "0.9cqw", top: "0.9cqw", right: "0.9cqw", bottom: "0.9cqw" }),
                clipPath: shieldClip,
                background: `linear-gradient(150deg, ${darken(accent, 0.12)} 0%, ${darken(accent, 0.5)} 55%, ${darken(accent, 0.72)} 100%)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                // The shield narrows to a point, so lift the text into the wider top part.
                paddingBottom: "4cqw",
                color: aPale,
                fontWeight: 800,
                fontSize: "2.9cqw",
                lineHeight: 1.05,
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              <span>TIER {card.tier.trim() || "_"}</span>
              <span>SPEC{card.spec.trim() ? ` ${card.spec.trim()}` : ""}</span>
            </div>
          </div>

          {/* Steering wheel */}
          <svg viewBox="0 0 48 48" style={{ ...abs({ right: "2.4cqw", top: "50%", width: "13cqw", height: "13cqw" }), transform: "translateY(-50%)" }} aria-hidden>
            <g fill="none" stroke={text} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="24" cy="24" r="19" />
              <circle cx="24" cy="24" r="5" fill={text} />
              <path d="M6 22 C13 22 18 23 19 24 M42 22 C35 22 30 23 29 24 M24 29 V43" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
