import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnreadCount } from "@/actions/notifications";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";
import { PullToRefresh } from "@/components/PullToRefresh";
import { DevToolsPanel } from "@/components/DevToolsPanel";
import { getForceSelfCheckIn } from "@/actions/dev";

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

    const [unread, winnerInfo] = await Promise.all([
      getUnreadCount(session.user.id),
      isAdminOrMod ? getCurrentWeekWinnerInfo() : Promise.resolve(null),
    ]);
    const sessionUser = session.user as typeof session.user & { customAvatar?: string | null };
    customAvatar = sessionUser.customAvatar || null;
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

  // Developer tools (local only). realRole is present on the session when the
  // admin is currently impersonating a member.
  const isDev = process.env.NODE_ENV === "development";
  const sessionUserWithReal = session.user as typeof session.user & { realRole?: string };
  const isImpersonating = Boolean(sessionUserWithReal.realRole);
  const realRole = sessionUserWithReal.realRole ?? session.user.role ?? "member";
  const forceSelfCheckin = isDev ? await getForceSelfCheckIn() : false;

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {isDev && (
        <DevToolsPanel
          isImpersonating={isImpersonating}
          realRole={realRole}
          forceSelfCheckin={forceSelfCheckin}
        />
      )}
      <ProtectedNavigation
        user={userWithAvatar}
        unreadNotifications={unreadCount}
        winnerSelectionPending={winnerSelectionPending}
      />
      <main className="pwa-protected-content flex-1 overflow-y-auto md:pt-0 flex flex-col">
        <PullToRefresh>
          <div className="pwa-protected-bottom flex-1 flex flex-col md:pb-0">
            {children}
          </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
