import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { AdminNavigation } from "@/components/AdminNavigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "admin" && session.user.role !== "moderator") {
    redirect("/dashboard");
  }

  let customAvatar: string | null = null;
  let unreadCount = 0;
  try {
    const [avatar, unread] = await Promise.all([
      redis.hget(`member:${session.user.id}`, "customAvatar") as Promise<string | null>,
      redis.get(`notifications:${session.user.id}:unread`).then((v) => Number(v) || 0),
    ]);
    customAvatar = avatar;
    unreadCount = unread;
  } catch {
    // Silently handle errors
  }

  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950">
      <AdminNavigation user={userWithAvatar} unreadNotifications={unreadCount} />
      <main className="flex-1 overflow-y-auto pt-14 pb-16 md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
