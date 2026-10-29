import NextAuth from "next-auth";
import { cookies } from "next/headers";
import Google from "next-auth/providers/google";
import { redis } from "./redis";

// Parse ADMIN_EMAILS defensively. It's expected to be a JSON array of emails
// (e.g. ["a@b.com"]), but a malformed value (missing quotes, env mangling)
// must NOT crash the whole app — auth is imported by every protected page.
// Falls back to accepting either valid JSON or a plain comma/space separated
// list, and otherwise an empty list.
const ADMIN_EMAILS: string[] = (() => {
  const raw = (process.env.ADMIN_EMAILS || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((e) => String(e).trim()).filter(Boolean);
  } catch {
    // Not valid JSON — tolerate a bare/comma-separated list like
    // [a@b.com, c@d.com] or a@b.com,c@d.com instead of crashing.
    return raw
      .replace(/^\[|\]$/g, "")
      .split(/[,\s]+/)
      .map((e) => e.replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
  }
  return [];
})();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "phd-auth-secret-fallback-key-2026",
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      try {
        if (user && account) {
          const stableId = account.providerAccountId;
          token.sub = stableId;

          // Check if member already exists in Redis
          const existing = await redis.hgetall(`member:${stableId}`);

          if (!existing || Object.keys(existing).length === 0) {
            // New user — assign role from ADMIN_EMAILS
            const role = ADMIN_EMAILS.includes(user.email ?? "")
              ? "admin"
              : "member";
            token.role = role;
            token.theme = "light";

            await redis.hset(`member:${stableId}`, {
              id: stableId,
              email: user.email,
              name: user.name,
              image: user.image ?? "",
              role,
              theme: "light",
              cardCredits: 1,
              createdAt: Date.now(),
            });
            // Keep the member directory current (see lib/member-roster).
            try {
              const { addToMemberIndex } = await import("@/lib/member-roster");
              const { bustMemberRoster, bustAdminMembers } = await import("@/lib/cache-bust");
              await addToMemberIndex(stableId);
              bustMemberRoster();
              bustAdminMembers();
            } catch (err) {
              console.error("[Auth] Member index update failed:", err);
            }
          } else {
            // Existing user — use the role and theme from Redis
            token.role = (existing.role as "admin" | "moderator" | "member" | "asbo-rc") || "member";
            token.theme = (existing.theme as "light" | "dark") || "light";
            if (existing.customAvatar) {
              token.customAvatar = existing.customAvatar;
            }

            // Update name/image only (don't touch role or theme)
            await redis.hset(`member:${stableId}`, {
              name: user.name,
              image: user.image ?? "",
            });
          }
        } else if (token.sub) {
          // Always keep elevated roles (admin / moderator) synced with Redis so demotions take effect immediately
          if (token.role === "admin" || token.role === "moderator" || token.avatarChecked === undefined) {
            try {
              const fields = await redis.hmget<Record<string, unknown>>(
                `member:${token.sub}`,
                "role",
                "customAvatar"
              );
              if (typeof fields?.role === "string" && fields.role) token.role = fields.role;
              if (typeof fields?.customAvatar === "string" && fields.customAvatar) {
                token.customAvatar = fields.customAvatar;
              }
              token.avatarChecked = true;
            } catch (err) {
              console.error("[Auth] Role/avatar sync error:", err);
            }
          }

          // Handle manual session updates
          if (trigger === "update" && session) {
            if (session.theme) token.theme = session.theme;
            if (session.role) token.role = session.role;
            if (session.name) token.name = session.name;
            if (session.image) token.picture = session.image;
            if (session.customAvatar !== undefined) token.customAvatar = session.customAvatar;
          }
        }
      } catch (err) {
        console.error("[Auth JWT] Callback error:", err);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        session.user.role = token.role as "admin" | "moderator" | "member" | "asbo-rc";
        session.user.theme = token.theme as "light" | "dark";
        if (token.customAvatar) {
          (session.user as any).customAvatar = token.customAvatar;
        }
        
        // Developer Mode Impersonation. "member" = plain member; "member_active"
        // = member WITH an active membership (display-only, no Redis writes).
        if (process.env.NODE_ENV === "development") {
          const cookieStore = await cookies();
          const impersonate = cookieStore.get("dev_impersonate_role")?.value;
          if (impersonate === "member" || impersonate === "member_active") {
            // Add a flag so the UI knows we are impersonating
            (session.user as any).realRole = session.user.role;
            session.user.role = "member";
            if (impersonate === "member_active") {
              (session.user as any).devFakeMembership = true;
            }
          }
        }
      }
      return session;
    },
  },
});
