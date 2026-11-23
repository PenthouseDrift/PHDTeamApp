/**
 * Which "app" a request is for, decided by the host name it arrived on.
 *
 * The same deployment serves two experiences:
 *   - the full Penthouse Drift app (app.penthousedrift.com and friends), and
 *   - a game-only Drift Clash app (driftclashapp.penthousedrift.com), which shows only the card game.
 *
 * Pure (no Next imports) so the edge middleware can use it. Extra Drift Clash hosts can be added with the
 * DRIFTCLASH_HOSTS env var (comma separated). An entry without a port matches that host on any port; an
 * entry with a port matches only that port.
 *
 * Trying it locally: Google sign-in only accepts http redirect URIs for exactly "localhost" (not
 * "*.localhost"), so run the game host on its own port and register that URI with Google:
 *   start the dev server with DRIFTCLASH_HOSTS=localhost:3001 on port 3001
 *   -> http://localhost:3001 is the game, redirect URI http://localhost:3001/api/auth/callback/google
 * (Stop the normal dev server first: two Next dev servers can't share one project folder.)
 */

const DEFAULT_DRIFTCLASH_HOSTS = ["driftclashapp.penthousedrift.com"];

function configuredHosts(): string[] {
  const fromEnv = (process.env.DRIFTCLASH_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_DRIFTCLASH_HOSTS, ...fromEnv];
}

/** True when the request host (with or without a port) is one of the game-only Drift Clash hosts. */
export function isDriftClashHost(host: string | null | undefined): boolean {
  const withPort = (host || "").split(",")[0].trim().toLowerCase();
  if (!withPort) return false;
  const withoutPort = withPort.replace(/:\d+$/, "");
  const hosts = configuredHosts();
  return hosts.includes(withPort) || hosts.includes(withoutPort);
}

/**
 * Routes the game-only host serves. Everything else is sent back to /cards.
 *   /cards                 the game itself (hub, play, packs, store, marketplace, leaderboard) and the pack wizard
 *   /cars                  the garage: a card is forged from one of the member's cars
 *   /tuning-advisor        the garage's AI Tuning Advisor
 *   /calculator            the garage's Gear Calculator
 *   /tuning                the garage hub that the two tools above link back to ("← Tuning"); it only lists the garage pages
 *   /auth                  sign-in
 *   /api                   route handlers (uploads, auth callbacks, webhooks, the tuning advisor); these enforce their own auth
 */
const DRIFTCLASH_ALLOWED_PREFIXES = ["/cards", "/cars", "/tuning-advisor", "/calculator", "/tuning", "/auth", "/api"];

export function isDriftClashPath(pathname: string): boolean {
  return DRIFTCLASH_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
