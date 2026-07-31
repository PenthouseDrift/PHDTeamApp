import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";
import { BetaFeedbackBanner } from "@/components/BetaFeedbackBanner";
import { PullToRefresh } from "@/components/PullToRefresh";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Fetch avatar, unread count, and winner status in parallel
  let customAvatar: string | null = null;
  let unreadCount = 0;
  let winnerSelectionPending = false;

  try {
    const isAdminOrMod = session.user.role === "admin" || session.user.role === "moderator";

    const [avatar, unread, winnerInfo] = await Promise.all([
      redis.hget(`member:${session.user.id}`, "customAvatar") as Promise<string | null>,
      redis.get(`notifications:${session.user.id}:unread`).then(v => Number(v) || 0),
      isAdminOrMod ? getCurrentWeekWinnerInfo() : Promise.resolve(null),
    ]);
    customAvatar = avatar;
    unreadCount = unread;
    if (isAdminOrMod && winnerInfo) {
      const day = new Date().getDay();
      const isWeekend = day === 0 || day === 6;
      winnerSelectionPending = isWeekend && !winnerInfo.shellId;
    }
  } catch {
    // Silently fail
  }

  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950">
      <ProtectedNavigation
        user={userWithAvatar}
        unreadNotifications={unreadCount}
        winnerSelectionPending={winnerSelectionPending}
      />
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0 flex flex-col">
        <BetaFeedbackBanner />
        <PullToRefresh>
          <div className="flex-1 flex flex-col pb-24 md:pb-0">
            {children}
          </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
