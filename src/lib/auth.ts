import NextAuth from "next-auth";
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
    async jwt({ token, user, account }) {
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

            // Update name/image only (don't touch role or theme)
            await redis.hset(`member:${stableId}`, {
              name: user.name,
              image: user.image ?? "",
            });
          }
        } else if (token.sub) {
          // Refresh role and theme from Redis on subsequent requests with fallback
          try {
            const [freshRole, freshTheme] = await Promise.all([
              redis.hget(`member:${token.sub}`, "role") as Promise<string | null>,
              redis.hget(`member:${token.sub}`, "theme") as Promise<string | null>,
            ]);
            if (freshRole) {
              token.role = freshRole as "admin" | "moderator" | "member";
            }
            if (freshTheme) {
              token.theme = freshTheme as "light" | "dark";
            }
          } catch (redisErr) {
            console.warn("[Auth JWT] Soft Redis fetch error:", redisErr);
          }
        }
      } catch (err) {
        console.error("[Auth JWT] Callback error:", err);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = (token.role as "admin" | "moderator" | "member") || "member";
        session.user.theme = (token.theme as "light" | "dark") || "light";
      }
      return session;
    },
  },
});
