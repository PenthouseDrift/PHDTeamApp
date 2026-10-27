"use client";

import { useId } from "react";
import { Barlow_Condensed } from "next/font/google";
import { darken, lighten } from "@/lib/card-maker";
import { tierInfo, type FullArtCardData } from "@/lib/full-art-card";
import { HEADER_LOGO_SRC, headerLogoStyle, headerTagLayout } from "@/components/cards/card-header";

const cardFont = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"] });

/**
 * The full art PHD card: the picture fills the whole card and a thin tier-coloured frame,
 * a tier tag, and a text block sit over it. Like PhdCard, everything is sized in `cqw`
 * (1% of the card's own width) so it renders the same at any size, including 63mm printed.
 * The card is 100 units wide and 139.7 tall (63 x 88).
 */

const H = 139.7;

/** Each stat is out of 10, so the total score is out of 40. */
const MAX_STAT = 10;
const MAX_TOTAL_SCORE = MAX_STAT * 4;

const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", ...style });

export function FullArtCard({
  card,
  className,
  placeholders = false,
  flat = false,
}: {
  card: FullArtCardData;
  className?: string;
  /** Show hints in empty fields (editor preview only, never printed). */
  placeholders?: boolean;
  /** Print mode: drop the on-screen edge ring. */
  flat?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const tier = tierInfo(card.tier);
  const { light, accent, dark, glow } = tier.palette;
  const isLegend = card.tier === "legend";
  const pale = lighten(accent, 0.72);

  // The legend frame is a prismatic gradient; the others are brushed metal in the tier colour.
  const frameStops = isLegend
    ? [
        ["0", "#7df9ff"],
        ["0.25", "#a78bfa"],
        ["0.5", "#ff7ad9"],
        ["0.75", "#ffd75e"],
        ["1", "#7df9ff"],
      ]
    : [
        ["0", light],
        ["0.28", accent],
        ["0.52", dark],
        ["0.74", accent],
        ["1", light],
      ];
  const tagBackground = isLegend
    ? "linear-gradient(120deg, #7df9ff, #a78bfa 35%, #ff7ad9 65%, #ffd75e)"
    : `linear-gradient(135deg, ${light} 0%, ${accent} 45%, ${darken(accent, 0.3)} 100%)`;

  const name = card.name.trim() || (placeholders ? "CAR NAME" : "");
  // One line only: long names step down in size instead of wrapping (average glyph ~0.42 of the font size).
  const nameSize = Math.min(10.5, 80 / Math.max(1, name.length * 0.46));
  const ability = card.ability.trim() || (placeholders ? "[Ability / Chassis Type]" : "");
  const effect = card.effect.trim() || (placeholders ? "[Effect / flavour text]" : "");
  const driver = card.driver.trim() || (placeholders ? "[Name]" : "");
  const team = card.team.trim() || (placeholders ? "[Name]" : "");

  const stats: Array<[string, string]> = [
    ["Drift", card.stats.drift],
    ["Accel", card.stats.accel],
    ["Grip", card.stats.grip],
    ["Steer", card.stats.steer],
  ];

  // The four stats added up, each counted as 0 to 10, so the most a card can score is 40.
  // Nothing is shown while the stats are empty (a blank "__/40" only in the editor preview).
  const statNumbers = stats.map(([, value]) => Number.parseInt(value, 10)).filter((n) => Number.isFinite(n));
  const score: number | "placeholder" | null =
    statNumbers.length > 0
      ? statNumbers.reduce((sum, n) => sum + Math.min(MAX_STAT, Math.max(0, n)), 0)
      : placeholders
        ? "placeholder"
        : null;

  return (
    <div
      className={`${cardFont.className} ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "63 / 88",
        containerType: "inline-size",
        // Text inherits text-align, and a <button> parent (card grids) would centre it. The design is left aligned.
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
          background: `linear-gradient(160deg, ${dark}, #0b0b0d)`,
          boxShadow: flat ? "none" : "0 0 0 0.25cqw rgba(0,0,0,0.5)",
        }}
      >
        {/* The picture, edge to edge */}
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            data-card-image
            alt={card.name}
            style={{
              ...abs({ inset: 0 }),
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
          <div style={{ ...abs({ inset: 0 }), display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.45)", fontSize: "9cqw", fontWeight: 800, textAlign: "center", lineHeight: 1 }}>
            PLACE IMAGE HERE
          </div>
        )}

        {/* Foil: a soft diagonal sheen, plus a rainbow wash on Legend cards */}
        <div style={{ ...abs({ inset: 0 }), background: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0) 66%)", mixBlendMode: "screen", pointerEvents: "none" }} />
        {isLegend && (
          <div style={{ ...abs({ inset: 0 }), background: "linear-gradient(135deg, rgba(125,249,255,0.2), rgba(167,139,250,0.14) 35%, rgba(255,122,217,0.18) 65%, rgba(255,215,94,0.2))", mixBlendMode: "soft-light", pointerEvents: "none" }} />
        )}
        {/* Darkens the bottom so the text reads on any picture */}
        <div style={{ ...abs({ left: 0, right: 0, bottom: 0, height: "56cqw" }), background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.88) 100%)", pointerEvents: "none" }} />
        {/* A little at the top for the logo and tier tag */}
        <div style={{ ...abs({ left: 0, right: 0, top: 0, height: "26cqw" }), background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))", pointerEvents: "none" }} />

        {/* Frame: a tier-coloured metal edge with a glow */}
        <div style={{ ...abs({ inset: 0 }), borderRadius: "5cqw", boxShadow: `inset 0 0 5cqw ${glow}66`, pointerEvents: "none" }} />
        <svg viewBox={`0 0 100 ${H}`} style={abs({ inset: 0, width: "100%", height: "100%" })} aria-hidden>
          <defs>
            <linearGradient id={`frame-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2={H}>
              {frameStops.map(([offset, colour]) => (
                <stop key={offset} offset={offset} stopColor={colour} />
              ))}
            </linearGradient>
          </defs>
          <rect x="1.3" y="1.3" width="97.4" height={H - 2.6} rx="4.2" fill="none" stroke={`url(#frame-${uid})`} strokeWidth="2.6" />
          <rect x="3.1" y="3.1" width="93.8" height={H - 6.2} rx="3" fill="none" stroke={pale} strokeWidth="0.35" opacity="0.8" />
        </svg>

        {/* Top row: the P mark and the tier tag */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HEADER_LOGO_SRC} alt="" style={headerLogoStyle} />
        {/* Top right: the tier tag with the total score directly under it (one column, so they always line up) */}
        <div
          style={{
            ...abs({ right: headerTagLayout.right, top: headerTagLayout.top }),
            width: headerTagLayout.width,
            display: "flex",
            flexDirection: "column",
            // Right aligned, so the score ends flush with the pill's right edge.
            alignItems: "flex-end",
            gap: "1.6cqw",
          }}
        >
          <div
            style={{
              ...headerTagLayout,
              // The tag sits in the column now, so it takes its place from there.
              position: "static",
              width: "100%",
              background: tagBackground,
              color: isLegend ? "#12082e" : darken(accent, 0.72),
              borderColor: pale,
              boxShadow: `0 0 3cqw ${glow}aa, 0 0.6cqw 1cqw rgba(0,0,0,0.5)`,
            }}
          >
            {tier.label}
          </div>

          {/* Total score, e.g. 23/40 */}
          {score !== null && (
            <span
              role="img"
              aria-label={score === "placeholder" ? `Total score out of ${MAX_TOTAL_SCORE}` : `Total score ${score} out of ${MAX_TOTAL_SCORE}`}
              style={{
                padding: "0.9cqw 2.6cqw",
                borderRadius: "1.2cqw",
                background: "rgba(0,0,0,0.5)",
                border: `0.3cqw solid ${accent}`,
                color: pale,
                fontSize: "4cqw",
                fontWeight: 800,
                letterSpacing: "0.04em",
                lineHeight: 1,
                whiteSpace: "nowrap",
                textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
              }}
            >
              {score === "placeholder" ? "__" : score}/{MAX_TOTAL_SCORE}
            </span>
          )}
        </div>

        {/* Text block */}
        <div style={{ ...abs({ left: "7cqw", right: "7cqw", bottom: "6.4cqw" }), color: "#fff", textShadow: "0 0.2cqw 0.9cqw rgba(0,0,0,0.95), 0 0 0.3cqw rgba(0,0,0,0.9)" }}>
          {(driver || team) && (
            <div style={{ fontSize: "3.6cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.15, opacity: 0.95, marginBottom: "1.4cqw" }}>
              {driver && (
                <span style={{ opacity: card.driver.trim() ? 1 : 0.6 }}>
                  <span style={{ color: light }}>Driver </span>
                  {driver}
                </span>
              )}
              {driver && team && <span style={{ color: accent }}> · </span>}
              {team && (
                <span style={{ opacity: card.team.trim() ? 1 : 0.6 }}>
                  <span style={{ color: light }}>Team </span>
                  {team}
                </span>
              )}
            </div>
          )}

          {name && (
            <div style={{ fontSize: `${nameSize}cqw`, fontWeight: 800, textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", letterSpacing: "0.01em", opacity: card.name.trim() ? 1 : 0.6 }}>
              {name}
            </div>
          )}
          <div style={{ height: "0.7cqw", margin: "1.6cqw 0", background: isLegend ? "linear-gradient(90deg, #7df9ff, #a78bfa, #ff7ad9, #ffd75e)" : `linear-gradient(90deg, ${light}, ${accent} 55%, transparent)`, borderRadius: "1cqw", boxShadow: `0 0 2cqw ${glow}aa` }} />
          {ability && (
            <div style={{ fontSize: "3.9cqw", fontWeight: 700, color: light, lineHeight: 1.1, opacity: card.ability.trim() ? 1 : 0.7, overflowWrap: "anywhere" }}>{ability}</div>
          )}
          {effect && (
            <div style={{ fontSize: "3.3cqw", fontWeight: 600, lineHeight: 1.15, marginTop: "0.8cqw", opacity: card.effect.trim() ? 0.92 : 0.55, overflowWrap: "anywhere" }}>{effect}</div>
          )}

          {/* Stats */}
          <div
            style={{
              marginTop: "2.4cqw",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              padding: "1.6cqw 1cqw",
              borderRadius: "1.4cqw",
              background: "rgba(0,0,0,0.55)",
              border: `0.4cqw solid ${accent}`,
              boxShadow: `0 0 2.4cqw ${glow}66`,
            }}
          >
            {stats.map(([statLabel, value]) => (
              <span key={statLabel} style={{ fontSize: "4.8cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: accent, whiteSpace: "nowrap", textShadow: "none" }}>
                {statLabel}: <span style={{ color: pale }}>{value.trim() || "__"}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
