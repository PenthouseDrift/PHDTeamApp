import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isDriftClashHost } from "@/lib/app-host";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const icons: MetadataRoute.Manifest["icons"] = [
    { src: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];

  // Game-only host: installs as its own "Drift Clash" app that opens straight into the game.
  if (isDriftClashHost(h.get("x-forwarded-host") ?? h.get("host"))) {
    return {
      name: "Drift Clash",
      short_name: "Drift Clash",
      description: "Collect RC drift cards and take on other drivers",
      id: "/",
      // The game-only middleware sends "/" to the game (or to sign-in when logged out).
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#09090b",
      background_color: "#09090b",
      categories: ["games", "entertainment"],
      icons,
    };
  }

  return {
    name: "Penthouse Drift",
    short_name: "PHD",
    description: "RC Drift Track Community Platform — memberships, car setups, and more",
    id: "/",
    // Start at the public root. Launching directly into /dashboard makes iOS
    // open a protected route that redirects logged-out users to sign-in, which
    // reads as a broken launch. The root routes authenticated users onward.
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#09090b",
    background_color: "#09090b",
    categories: ["sports", "social"],
    icons,
  };
}
