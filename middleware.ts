import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuth = !!req.auth;
  const isStaff = req.auth?.user?.role === "admin" || req.auth?.user?.role === "moderator";

  // Public routes
  if (pathname === "/" || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // Require auth for all other routes
  if (!isAuth) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  // Admin/Mod routes require admin or moderator role
  if (pathname.startsWith("/admin") && !isStaff) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.png|favicon-48\\.png|favicon\\.ico|apple-touch-icon\\.png|icons|sw\\.js|manifest\\.webmanifest|logo\\.png|api/auth|api/webhooks|api/cron|api/push|api/public).*)",
  ],
};
