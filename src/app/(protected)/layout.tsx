import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Fetch avatar and unread count in parallel
  const [customAvatar, unreadCount] = await Promise.all([
    redis.hget(`member:${session.user.id}`, "customAvatar") as Promise<string | null>,
    redis.get(`notifications:${session.user.id}:unread`).then(v => Number(v) || 0),
  ]);

  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950">
      <ProtectedNavigation user={userWithAvatar} unreadNotifications={unreadCount} />
      <main className="flex-1 overflow-y-auto pt-14 pb-16 md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
