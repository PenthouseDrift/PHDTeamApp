import type { Viewport } from "next";

/** The viewport every page uses. */
export const baseViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/**
 * The viewport for the game: the page can't be pinch-zoomed, so it behaves like an app on a phone. The browser's own setting is
 * not enough on iPhones (Safari ignores it), so `NoPinchZoom` also blocks the gesture there.
 */
export const gameViewport: Viewport = { ...baseViewport, maximumScale: 1, userScalable: false };
