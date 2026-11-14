import { headers } from "next/headers";
import { isDriftClashHost } from "@/lib/app-host";

/**
 * Public base URL to send people back to after leaving the site (e.g. a SumUp checkout return).
 *
 * Normally that is NEXT_PUBLIC_APP_URL. When the request came in on the game-only Drift Clash host it is
 * that host instead, so a player who pays inside the game lands back in the game and not on the main app.
 * Only the known Drift Clash hosts are echoed back, never an arbitrary Host header.
 */
export async function requestBaseUrl(): Promise<string> {
  const fallback = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    if (isDriftClashHost(host)) {
      const isLocal = host.toLowerCase().includes("localhost");
      return `${isLocal ? "http" : "https"}://${host}`;
    }
  } catch {
    // Not in a request (e.g. a background job): use the configured URL.
  }
  return fallback;
}
