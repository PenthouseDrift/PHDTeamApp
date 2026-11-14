import { NextResponse, type NextRequest } from "next/server";
import { isDriftClashHost, isDriftClashPath } from "@/lib/app-host";

/**
 * Game-only host (driftclashapp.penthousedrift.com): the same app, but only the Drift Clash game is reachable.
 * Anything else is sent to the game, so none of the track, shop or admin pages show up there.
 *
 * It does nothing on any other host. It does not check sign-in itself: the page layouts and routes already
 * do, and send logged-out visitors to /auth/signin.
 */
export function proxy(req: NextRequest) {
  if (!isDriftClashHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (pathname === "/" || !isDriftClashPath(pathname)) {
    return NextResponse.redirect(new URL("/cards", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip static files and the endpoints that must always stay reachable (auth callbacks, payment
  // webhooks, cron, push, public API).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.png|favicon-48\\.png|favicon\\.ico|apple-touch-icon\\.png|icons|sw\\.js|offline\\.html|manifest\\.webmanifest|logo\\.png|api/auth|api/webhooks|api/cron|api/push|api/public).*)",
  ],
};
