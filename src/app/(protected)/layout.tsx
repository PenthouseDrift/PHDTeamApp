import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";
import { getUnreadCount } from "@/actions/notifications";
import { cache } from "react";

const getCustomAvatar = cache(async (userId: string) => {
  return await redis.hget(`member:${userId}`, "customAvatar") as string | null;
});

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const customAvatar = await getCustomAvatar(session.user.id);
  const unreadCount = await getUnreadCount(session.user.id);
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
