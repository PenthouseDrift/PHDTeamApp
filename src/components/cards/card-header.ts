import type { CSSProperties } from "react";

/**
 * The top row (P logo and tag pill) of the full art cards, so the logo and the pill are exactly the
 * same size and in the same place on every tier. Change them here only.
 * Units are `cqw`, 1% of the card's width.
 */

const MARK_RATIO = 812 / 1398; // public/logo.png is 1398 x 812

export const HEADER_LOGO_SRC = "/logo.png";

/** Position and size of the P logo. */
export const headerLogoStyle: CSSProperties = {
  position: "absolute",
  left: "6.5cqw",
  top: "6cqw",
  width: "17cqw",
  height: `${17 * MARK_RATIO}cqw`,
  filter: "drop-shadow(0 0.5cqw 0.6cqw rgba(0,0,0,0.7))",
};

/** Position, size and lettering of the tag pill. The caller adds the colours and shadow. */
export const headerTagLayout: CSSProperties = {
  position: "absolute",
  right: "6.5cqw",
  top: "6.4cqw",
  fontWeight: 800,
  fontSize: "4.4cqw",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1,
  // Same width for every label (Bronze, Silver, Gold, Legend), so the pill never changes size.
  width: "28cqw",
  boxSizing: "border-box",
  textAlign: "center",
  whiteSpace: "nowrap",
  padding: "1.5cqw 0 1.5cqw 0.12em",
  borderRadius: "1.2cqw",
  borderWidth: "0.4cqw",
  borderStyle: "solid",
};
