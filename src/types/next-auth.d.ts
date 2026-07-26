import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "moderator" | "member";
      theme?: "light" | "dark";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "moderator" | "member";
    theme?: "light" | "dark";
  }
}
