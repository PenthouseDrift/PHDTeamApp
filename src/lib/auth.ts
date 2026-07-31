import NextAuth from "next-auth";
import { cookies } from "next/headers";
import Google from "next-auth/providers/google";
import { redis } from "./redis";

const ADMIN_EMAILS: string[] = JSON.parse(
  process.env.ADMIN_EMAILS || "[]"
);

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
              createdAt: Date.now(),
            });
          } else {
            // Existing user — use the role and theme from Redis
            token.role = (existing.role as "admin" | "moderator" | "member") || "member";
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
        session.user.role = token.role as "admin" | "moderator" | "member";
        session.user.theme = token.theme as "light" | "dark";
        if (token.customAvatar) {
          (session.user as any).customAvatar = token.customAvatar;
        }
        
        // Developer Mode Impersonation
        if (process.env.NODE_ENV === "development") {
          const cookieStore = await cookies();
          const impersonate = cookieStore.get("dev_impersonate_role")?.value;
          if (impersonate === "member") {
            // Add a flag so the UI knows we are impersonating
            (session.user as any).realRole = session.user.role;
            session.user.role = "member";
          }
        }
      }
      return session;
    },
  },
});
