import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
  // sharp is a native module (it shrinks card pictures to WebP). Keep it out of the bundle and load it from node_modules.
  serverExternalPackages: ["sharp"],
  // sharp loads its native engine (libvips, a shared library) at run time. Next's file tracing only follows imports, so it
  // finds sharp's small loader file but leaves out the libvips file next to it, and on Vercel every picture then fails with
  // "libvips-cpp.so... cannot open shared object file". Listing the packages here ships them with every function that could
  // need them (sharp is used by uploads, card art and several admin/card actions). Only the platform that was installed
  // (linux-x64 on Vercel) exists, so this does not pull in the other platforms' copies.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/**/*"],
  },
  experimental: {
    // Reuse a page's data for 30s when someone revisits it (tab hopping, Back).
    // Every action that changes data revalidates its paths, which clears this,
    // so edits still show immediately; it only stops pointless re-renders.
    staleTimes: { dynamic: 30 },
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
