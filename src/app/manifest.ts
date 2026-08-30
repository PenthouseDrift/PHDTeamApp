import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Penthouse Drift",
    short_name: "PHD",
    description: "RC Drift Track Community Platform — memberships, car setups, and more",
    id: "/",
    start_url: "/dashboard",
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
