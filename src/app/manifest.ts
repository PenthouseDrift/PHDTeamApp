import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
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
    icons: [
      { src: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
