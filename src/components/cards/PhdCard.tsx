"use client";

import { useId } from "react";
import { Barlow_Condensed } from "next/font/google";
import { DEFAULT_HEADER_TEXT, darken, lighten, luminance, mix, type CardData } from "@/lib/card-maker";

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
  "M9 3.2 H91 L96.8 9 V44 L94.8 46 V90.6 L96.8 92.6 V129.4 L91 135.8 H80.4 L76.2 133.5 H23.8 L19.6 135.8 H9 L3.2 129.4 V92.6 L5.2 90.6 V46 L3.2 44 V9 Z";
const BEZEL_INNER =
  "M10.8 5 H89.2 L95 10.8 V44.4 L93.1 46.3 V90.3 L95 92.2 V128.6 L90.2 133.9 H81.2 L77.2 131.6 H22.8 L18.8 133.9 H9.8 L5 128.6 V92.2 L6.9 90.3 V46.3 L5 44.4 V10.8 Z";
// The name plate is clipped to the same shape as the inside of the bezel.
const plateClip = "polygon(0 0, 100% 0, 100% 79.4%, 94.9% 94.6%, 84.8% 94.6%, 80.4% 88%, 19.6% 88%, 15.2% 94.6%, 5.1% 94.6%, 0 79.4%)";
// Hex mesh strip follows the chamfered top corners of the bezel.
const meshClip = "polygon(6.25% 0, 93.75% 0, 100% 46%, 100% 100%, 0 100%, 0 46%)";

// ── Header badge geometry ───────────────────────────────────────────────────
// Drawn as SVG polygons (not clip-paths) so the rim is a true, even-width bevel and the
// drop shadow follows the real outline. Inset polygons are computed, not eyeballed.
const WIDE_H = 21.2; // height of the wide badge
type Pt = [number, number];

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

/** Outline, bevel and face polygons for a badge w x h. Round badges are a many-sided polygon so the same inset / clip code works. */
function makeBadge(w: number, h: number, round = false) {
  const outer: Pt[] = round
    ? Array.from({ length: 72 }, (_, k) => {
        const t = (k / 72) * Math.PI * 2;
        return [w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)] as Pt;
      })
    : [
        [w * 0.11, 0],
        [w * 0.89, 0],
        [w, h / 2],
        [w * 0.89, h],
        [w * 0.11, h],
        [0, h / 2],
      ];
  return { w, h, outer, face: insetPolygon(outer, BADGE_RIM), bevel: insetPolygon(outer, 0.55) };
}
const BADGE_WIDE = makeBadge(52, WIDE_H);
type Badge = ReturnType<typeof makeBadge>;

// Medallion sizes: the hexagon keeps the badge's proportions, the round one is a circle as tall as the hexagon.
const MEDALLION_SCALE = { small: 0.75, medium: 1, large: 1.2 } as const;
const medallionCache = new Map<string, ReturnType<typeof makeBadge>>();
function getMedallion(shape: "hex" | "round", size: keyof typeof MEDALLION_SCALE) {
  const key = `${shape}-${size}`;
  let b = medallionCache.get(key);
  if (!b) {
    const k = MEDALLION_SCALE[size];
    b = shape === "round" ? makeBadge(WIDE_H * k, WIDE_H * k, true) : makeBadge(30 * k, WIDE_H * k);
    medallionCache.set(key, b);
  }
  return b;
}

// The supplied PHD logo (public/): dark lettering for the white badge, light lettering for the dark one.
const LOGO_SRC = "/phd-logo.png";
const LOGO_LIGHT_SRC = "/phd-logo-light.png";

// Logo size inside the badge (card-width units). The PNG is 1410 x 455 and trimmed to the lettering.
const LOGO_W = 34;
const LOGO_H = (LOGO_W * 455) / 1410;
const LOGO_OUTLINE_W = 0.2;

// The gold P mark (public/logo.png, 1398 x 812).
const MARK_SRC = "/logo.png";
const MARK_RATIO = 812 / 1398;
const BLOB_HOST_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const NEXT_IMAGE_WIDTHS = [256, 384, 640, 750, 828] as const;

function getOptimizedCardImageProps(url: string, flat: boolean) {
  if (flat || !BLOB_HOST_RE.test(url)) {
    return { src: url, srcSet: undefined, sizes: undefined };
  }
  const encoded = encodeURIComponent(url);
  return {
    src: `/_next/image?url=${encoded}&w=640&q=75`,
    srcSet: NEXT_IMAGE_WIDTHS.map((w) => `/_next/image?url=${encoded}&w=${w}&q=75 ${w}w`).join(", "),
    sizes: "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 320px",
  };
}

function TeamPlaceholder({ x, y, size = 3.4 }: { x: number; y: number; size?: number }) {
  return (
    <text x={x} y={y + size * 0.35} textAnchor="middle" fontSize={size} fontWeight={800} fill="#8a8884" opacity={0.7}>
      TEAM LOGO
    </text>
  );
}

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
  const faceColour = card.logoStyle === "custom" ? card.logoCustomColour : card.logoStyle === "body" ? body : null;
  const darkFace = faceColour !== null && luminance(faceColour) < 0.55;
  const shownLogo = card.logoTone === "white" ? LOGO_LIGHT_SRC : LOGO_SRC;
  // A white badge is a soft white gradient; otherwise the face is the chosen colour with a light top and a deeper base.
  const faceTop = faceColour ? lighten(faceColour, 0.08) : "#f1f1f1";
  const faceMid = faceColour ? mix(faceColour, "#ffffff", 0.04) : "#ffffff";
  const faceBottom = faceColour ? darken(faceColour, darkFace ? 0.25 : 0.1) : "#ffffff";

  const headerStyle = card.headerStyle;
  const badge = headerStyle === "mark" ? getMedallion(card.medallionShape, card.medallionSize) : BADGE_WIDE;
  const BADGE_W = badge.w;
  const BADGE_H = badge.h;
  // The medallion can sit in either top corner; every other header is centred.
  const badgeLeft =
    headerStyle === "mark" && card.medallionPos === "left"
      ? 6.5
      : headerStyle === "mark" && card.medallionPos === "right"
        ? 100 - 6.5 - BADGE_W
        : (100 - BADGE_W) / 2;
  // The P fills a little over half of a hexagon medallion and a bit less of a round one.
  const markW = BADGE_W * (card.medallionShape === "round" ? 0.6 : 0.613);
  const outlineAttr = card.logoOutline ? `url(#bline-${uid})` : undefined;
  const textFill = card.logoTone === "white" ? "#ffffff" : "#111111";
  const titleLines = (card.headerText.trim() || DEFAULT_HEADER_TEXT).toUpperCase().split(/\s+/).reduce<string[]>((lines, word, idx) => {
    // First word on the top line, everything else on the second.
    if (idx === 0) lines.push(word);
    else if (lines.length === 1) lines.push(word);
    else lines[1] += ` ${word}`;
    return lines;
  }, []);
  const titleSize = Math.min(6.4, 22 / (Math.max(...titleLines.map((l) => l.length)) * 0.56));

  const name = card.name.trim() || "CAR NAME";
  // Long names step down in size so they stay on one line.
  // Nothing on the plate is ever cut off with "…": text shrinks (and the car name drops to a second line) to fit.
  // Widths are estimates (average glyph width as a fraction of the font size) because the card is sized in cqw.
  const NAME_W = 55.6;
  const INFO_W = 50.5; // text column once the bullet is taken off
  const oneLineFit = NAME_W / (name.length * 0.4);
  const nameLines = oneLineFit >= 6.4 ? 1 : 2;
  const nameSize =
    nameLines === 1
      ? Math.min(9.4, oneLineFit)
      : Math.min(9.4, NAME_W / ((Math.ceil(name.length / 2) + 2) * 0.4));
  const infoTop = Math.max(13.6, 2.4 + nameLines * nameSize * 1.05 + 0.8);
  const infoRoom = 30 - infoTop; // space down to where the plate's lifted bottom edge begins
  const abilityText = card.ability.trim() || (placeholders ? "[Ability / Chassis Type]" : "");
  const effectText = card.effect.trim() || (placeholders ? "[Effect description text / Flavour text goes here]" : "");
  const linesFor = (text: string, size: number) => (text ? Math.max(1, Math.ceil(text.length / (INFO_W / (0.38 * size)))) : 0);
  const ABILITY_SIZE = 3.6;
  const abilityHeight = linesFor(abilityText, ABILITY_SIZE) * ABILITY_SIZE * 1.12;
  let effectSize = ABILITY_SIZE;
  while (effectSize > 2.4 && abilityHeight + linesFor(effectText, effectSize) * effectSize * 1.12 > infoRoom) {
    effectSize = Math.round((effectSize - 0.1) * 10) / 10;
  }

  const statEntries: Array<[string, string]> = [
    ["Drift", card.stats.drift],
    ["Accel", card.stats.accel],
    ["Grip", card.stats.grip],
    ["Steer", card.stats.steer],
  ];

  const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", ...style });

  const renderBadge = (tag: string, b: Badge, left: number, children: React.ReactNode) => (
        <div
          key={tag}
          style={{
            ...abs({ left: `${left}cqw`, top: "2.2cqw", width: `${b.w}cqw`, height: `${b.h}cqw` }),
            filter: flat
              ? "drop-shadow(0 0.7cqw 0.6cqw rgba(0,0,0,0.5)) drop-shadow(0 1.4cqw 1.4cqw rgba(0,0,0,0.3))"
              : "drop-shadow(0 0.8cqw 0.6cqw rgba(0,0,0,0.6)) drop-shadow(0 1.8cqw 1.8cqw rgba(0,0,0,0.4))",
          }}
        >
          <svg viewBox={`0 0 ${b.w} ${b.h}`} style={abs({ inset: 0, width: "100%", height: "100%", overflow: "visible" })} aria-hidden>
            <defs>
              <linearGradient id={`bmetal-${uid}${tag}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={aPale} />
                <stop offset="0.25" stopColor={aLight} />
                <stop offset="0.5" stopColor={accent} />
                <stop offset="0.75" stopColor={aDark} />
                <stop offset="1" stopColor={aLight} />
              </linearGradient>
              <linearGradient id={`bface-${uid}${tag}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={faceTop} />
                <stop offset="0.18" stopColor={faceMid} />
                <stop offset="1" stopColor={faceBottom} />
              </linearGradient>
              <pattern id={`bhex-${uid}${tag}`} width="6" height="10.4" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
                <path d="M3 0 L6 1.73 V5.2 L3 6.93 L0 5.2 V1.73 Z M3 6.93 L3 10.4" fill="none" stroke={darkFace ? accent : aDark} strokeWidth="0.35" opacity={darkFace ? 0.55 : 0.3} />
              </pattern>
              <clipPath id={`bclip-${uid}${tag}`}>
                <polygon points={pointsAttr(b.face)} />
              </clipPath>
              {/* Outline: grow the lettering's alpha outwards, colour it, and put the logo on top. */}
              <filter id={`bline-${uid}${tag}`} x="-8%" y="-30%" width="116%" height="160%">
                <feMorphology in="SourceAlpha" operator="dilate" radius={LOGO_OUTLINE_W} result="grown" />
                <feFlood floodColor={card.logoOutlineColour} result="paint" />
                <feComposite in="paint" in2="grown" operator="in" result="line" />
                <feMerge>
                  <feMergeNode in="line" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polygon points={pointsAttr(b.outer)} fill={`url(#bmetal-${uid}${tag})`} strokeLinejoin="round" />
            <polygon points={pointsAttr(b.bevel)} fill="none" stroke={aPale} strokeWidth="0.28" opacity="0.85" strokeLinejoin="round" />
            <polygon points={pointsAttr(b.face)} fill={`url(#bface-${uid}${tag})`} />
            {card.hexPattern && <polygon points={pointsAttr(b.face)} fill={`url(#bhex-${uid}${tag})`} />}
            <polygon points={pointsAttr(b.face)} fill="none" stroke={aDark} strokeWidth="0.35" strokeLinejoin="round" />
            {/* Header content, clipped to the face so it never covers the rim. */}
            <g clipPath={`url(#bclip-${uid}${tag})`}>
{children}
            </g>
          </svg>

        </div>
  );

  const mainContent = (
    <>
              {headerStyle === "full" && (
                <image
                  href={shownLogo}
                  x={(BADGE_W - LOGO_W) / 2}
                  y={(BADGE_H - LOGO_H) / 2}
                  width={LOGO_W}
                  height={LOGO_H}
                  preserveAspectRatio="xMidYMid meet"
                  filter={outlineAttr}
                />
              )}

              {headerStyle === "mark" && (
                <image
                  href={MARK_SRC}
                  x={(BADGE_W - markW) / 2}
                  y={(BADGE_H - markW * MARK_RATIO) / 2}
                  width={markW}
                  height={markW * MARK_RATIO}
                  filter={outlineAttr}
                />
              )}

              {headerStyle === "mark-text" && (
                <>
                  <image href={MARK_SRC} x={6} y={(BADGE_H - 16.2 * MARK_RATIO) / 2} width={16.2} height={16.2 * MARK_RATIO} filter={outlineAttr} />
                  <g
                    fill={textFill}
                    fontWeight={800}
                    fontStyle="italic"
                    textAnchor="middle"
                    fontSize={titleSize}
                    stroke={card.logoOutline ? card.logoOutlineColour : undefined}
                    strokeWidth={card.logoOutline ? LOGO_OUTLINE_W * 2 : undefined}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    letterSpacing="0.04em"
                  >
                    {titleLines.length === 1 ? (
                      <text x={36} y={BADGE_H / 2 + titleSize * 0.35}>{titleLines[0]}</text>
                    ) : (
                      <>
                        <text x={36} y={BADGE_H / 2 - titleSize * 0.125}>{titleLines[0]}</text>
                        <text x={36} y={BADGE_H / 2 - titleSize * 0.125 + titleSize * 0.95}>{titleLines[1]}</text>
                      </>
                    )}
                  </g>
                </>
              )}

              {headerStyle === "team" &&
                (card.headerImageUrl ? (
                  <image href={card.headerImageUrl} x={8} y={3.6} width={36} height={14} preserveAspectRatio="xMidYMid meet" filter={outlineAttr} />
                ) : (
                  placeholders && <TeamPlaceholder x={BADGE_W / 2} y={BADGE_H / 2} />
                ))}

              {headerStyle === "team-mark" && (
                <>
                  <image href={MARK_SRC} x={5.5} y={(BADGE_H - 15.3 * MARK_RATIO) / 2} width={15.3} height={15.3 * MARK_RATIO} filter={outlineAttr} />
                  <line x1={23} y1={5.4} x2={23} y2={BADGE_H - 5.4} stroke={aDark} strokeWidth={0.3} opacity={0.7} />
                  {card.headerImageUrl ? (
                    <image href={card.headerImageUrl} x={25.5} y={3.6} width={21} height={14} preserveAspectRatio="xMidYMid meet" filter={outlineAttr} />
                  ) : (
                    placeholders && <TeamPlaceholder x={36} y={BADGE_H / 2} />
                  )}
                </>
              )}
    </>
  );

  // Team logo in the corner opposite the medallion.
  const teamCorner = headerStyle === "mark" && card.medallionPos !== "centre" && card.medallionTeam;
  const teamLeft = card.medallionPos === "left" ? 100 - 6.5 - badge.w : 6.5;
  const teamW = badge.w * (card.medallionShape === "round" ? 0.62 : 0.66);
  const teamH = badge.h * 0.6;
  const teamContent = card.headerImageUrl ? (
    <image
      href={card.headerImageUrl}
      x={(badge.w - teamW) / 2}
      y={(badge.h - teamH) / 2}
      width={teamW}
      height={teamH}
      preserveAspectRatio="xMidYMid meet"
      filter={card.logoOutline ? `url(#bline-${uid}-t)` : undefined}
    />
  ) : (
    placeholders && <TeamPlaceholder x={badge.w / 2} y={badge.h / 2} size={2.6} />
  );

  return (
    <div
      className={`${cardFont.className} ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "63 / 88",
        containerType: "inline-size",
        // A <button> parent (the saved cards list) would centre inherited text.
        textAlign: "left",
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
            ...abs({ left: "7.4cqw", right: "7.4cqw", top: "18cqw", height: "71.6cqw" }),
            background: "#d2d0cd",
            border: `0.9cqw solid ${aLight}`,
            borderRadius: "0.8cqw",
            overflow: "hidden",
            boxShadow: `inset 0 0 0 0.25cqw ${aDark}`,
          }}
        >
          {card.imageUrl ? (
            (() => {
              const imgProps = getOptimizedCardImageProps(card.imageUrl, flat);
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgProps.src}
                  srcSet={imgProps.srcSet}
                  sizes={imgProps.sizes}
                  loading={flat ? "eager" : "lazy"}
                  decoding="async"
                  data-card-image
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
              );
            })()
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
        {renderBadge("", badge, badgeLeft, mainContent)}
        {teamCorner && renderBadge("-t", badge, teamLeft, teamContent)}

        {/* Stats bar */}
        <div
          style={{
            ...abs({ left: "5.2cqw", right: "5.2cqw", top: "91.2cqw", height: "9.2cqw" }),
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
            ...abs({ left: "5.2cqw", right: "5.2cqw", top: "100.8cqw", height: "35cqw" }),
            background: `${plateSheen}, ${plate}`,
            clipPath: plateClip,
          }}
        >
          <div
            style={{
              ...abs({ left: "17cqw", right: "17cqw", top: "2.4cqw" }),
              textAlign: "center",
              color: text,
              fontWeight: 800,
              fontSize: `${nameSize}cqw`,
              textTransform: "uppercase",
              lineHeight: 1.05,
              textWrap: "balance",
              overflowWrap: "anywhere",
            }}
          >
            {name}
          </div>
          <div style={{ ...abs({ left: "18.5cqw", right: "18cqw", top: `${infoTop}cqw` }), color: text, fontWeight: 700, fontSize: `${ABILITY_SIZE}cqw`, lineHeight: 1.1 }}>
            {abilityText && (
              <div style={{ color: darken(accent, 0.28), opacity: card.ability.trim() ? 1 : 0.75, display: "flex", gap: "1cqw" }}>
                <span aria-hidden>•</span>
                <span style={{ overflowWrap: "anywhere" }}>{abilityText}</span>
              </div>
            )}
            {effectText && (
              <div style={{ display: "flex", gap: "1cqw", opacity: card.effect.trim() ? 1 : 0.55, fontSize: `${effectSize}cqw` }}>
                <span aria-hidden>•</span>
                <span style={{ overflowWrap: "anywhere" }}>{effectText}</span>
              </div>
            )}
          </div>

          {/* Tier / spec shield */}
          <div style={{ ...abs({ left: "2.4cqw", top: "50%", width: "13.4cqw", height: "18.6cqw" }), transform: "translateY(-50%)", clipPath: shieldClip, background: `linear-gradient(135deg, ${aLight}, ${aDark})` }}>
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
                paddingBottom: "4.2cqw",
                color: aPale,
                fontWeight: 800,
                fontSize: "3.1cqw",
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
          <svg viewBox="0 0 48 48" style={{ ...abs({ right: "2.4cqw", top: "50%", width: "13.8cqw", height: "13.8cqw" }), transform: "translateY(-50%)" }} aria-hidden>
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
