import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { AdminNavigation } from "@/components/AdminNavigation";
import { cache } from "react";

const getCustomAvatar = cache(async (userId: string) => {
  return await redis.hget(`member:${userId}`, "customAvatar") as string | null;
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const customAvatar = await getCustomAvatar(session.user.id);
  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  return (
    <div className="flex h-dvh bg-zinc-50">
      <AdminNavigation user={userWithAvatar} />
      <main className="flex-1 overflow-y-auto pt-14 pb-16 md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
