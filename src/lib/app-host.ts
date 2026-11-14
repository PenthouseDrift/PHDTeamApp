/**
 * Which "app" a request is for, decided by the host name it arrived on.
 *
 * The same deployment serves two experiences:
 *   - the full Penthouse Drift app (app.penthousedrift.com and friends), and
 *   - a game-only Drift Clash app (driftclashapp.penthousedrift.com), which shows only the card game.
 *
 * Pure (no Next imports) so the edge middleware can use it. The Drift Clash hosts can be overridden with
 * the DRIFTCLASH_HOSTS env var (comma separated, host names only, e.g. "driftclashapp.penthousedrift.com").
 * `driftclash.localhost` is always accepted so it can be tried locally (browsers send *.localhost to
 * 127.0.0.1): run `npm run dev` and open http://driftclash.localhost:3000.
 */

const DEFAULT_DRIFTCLASH_HOSTS = ["driftclashapp.penthousedrift.com", "driftclash.localhost"];

function configuredHosts(): string[] {
  const fromEnv = (process.env.DRIFTCLASH_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_DRIFTCLASH_HOSTS, ...fromEnv];
}

/** "Driftclashapp.PenthouseDrift.com:443" -> "driftclashapp.penthousedrift.com" */
function normaliseHost(host: string | null | undefined): string {
  return (host || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

/** True when the request host is one of the game-only Drift Clash hosts. */
export function isDriftClashHost(host: string | null | undefined): boolean {
  const h = normaliseHost(host);
  return h !== "" && configuredHosts().includes(h);
}

/**
 * Routes the game-only host serves. Everything else is sent back to /cards.
 *   /cards   the game itself (hub, play, packs, store, marketplace, leaderboard) and the pack wizard
 *   /cars    the garage: a card is forged from one of the member's cars
 *   /auth    sign-in
 *   /api     route handlers (uploads, auth callbacks, webhooks); these enforce their own auth
 */
const DRIFTCLASH_ALLOWED_PREFIXES = ["/cards", "/cars", "/auth", "/api"];

export function isDriftClashPath(pathname: string): boolean {
  return DRIFTCLASH_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
