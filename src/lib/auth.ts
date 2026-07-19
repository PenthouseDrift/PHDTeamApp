import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { redis } from "./redis";

const ADMIN_EMAILS: string[] = JSON.parse(
  process.env.ADMIN_EMAILS || "[]"
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, account }) {
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

          await redis.hset(`member:${stableId}`, {
            id: stableId,
            email: user.email,
            name: user.name,
            image: user.image ?? "",
            role,
            createdAt: Date.now(),
          });
        } else {
          // Existing user — use the role from Redis (respects admin toggle)
          token.role = (existing.role as string) || "member";

          // Update name/image only (don't touch role)
          await redis.hset(`member:${stableId}`, {
            name: user.name,
            image: user.image ?? "",
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role as "admin" | "member";
      return session;
    },
  },
});
