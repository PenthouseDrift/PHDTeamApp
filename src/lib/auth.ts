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
        // Use the provider's account ID as stable identifier
        const stableId = account.providerAccountId;
        token.sub = stableId;
        token.role = ADMIN_EMAILS.includes(user.email ?? "")
          ? "admin"
          : "member";

        // Only write to Redis if this member doesn't exist yet, or update name/image
        const existing = await redis.hgetall(`member:${stableId}`);
        if (!existing || Object.keys(existing).length === 0) {
          await redis.hset(`member:${stableId}`, {
            id: stableId,
            email: user.email,
            name: user.name,
            image: user.image ?? "",
            role: token.role,
            createdAt: Date.now(),
          });
        } else {
          // Update name/image in case they changed, but don't overwrite createdAt
          await redis.hset(`member:${stableId}`, {
            name: user.name,
            image: user.image ?? "",
            role: token.role,
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
