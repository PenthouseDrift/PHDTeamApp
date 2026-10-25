import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnreadCount } from "@/actions/notifications";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";
import { PullToRefresh } from "@/components/PullToRefresh";
import { DevToolsPanel } from "@/components/DevToolsPanel";
import { BasketProvider } from "@/components/marketplace/BasketProvider";
import { getForceSelfCheckIn, getImpersonation } from "@/actions/dev";
import { NewAppShell } from "@/components/new-shell/NewAppShell";
import { getDashboardVersion, getMemberHash } from "@/lib/dashboard-pref";
import { AutoCheckInPrompt } from "@/components/AutoCheckInPrompt";
import { parseAutoCheckInPrefs } from "@/lib/auto-checkin-prefs";

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
  const impersonateVariant = isDev ? await getImpersonation() : null;

  // First-run question: should buying a pass check you in automatically? Only
  // asked for options not answered yet; staff don't buy passes so aren't asked.
  // getMemberHash is the same per-request read the preference lookup below uses.
  const isStaffUser = session.user.role === "admin" || session.user.role === "moderator";
  const autoPrefs = isStaffUser ? null : parseAutoCheckInPrefs(await getMemberHash(session.user.id));
  const autoCheckInPrompt =
    autoPrefs && (autoPrefs.dayPass === null || autoPrefs.rental === null) ? (
      <AutoCheckInPrompt askDayPass={autoPrefs.dayPass === null} askRental={autoPrefs.rental === null} />
    ) : null;

  // Members who switched on the new experience (Profile -> New dashboard) get
  // the new shell around every page. One memoised HGET, shared with any page
  // that also checks the preference during this request.
  if ((await getDashboardVersion(session.user.id)) === "new") {
    return (
      // BasketProvider sits ABOVE the shell so the top bar can show the basket.
      <BasketProvider>
        {autoCheckInPrompt}
        {/* Dev tools stay available app-wide, in both experiences. */}
        {isDev && (
          <DevToolsPanel
            isImpersonating={isImpersonating}
            impersonateVariant={impersonateVariant}
            realRole={realRole}
            forceSelfCheckin={forceSelfCheckin}
          />
        )}
        <NewAppShell
          user={userWithAvatar}
          unreadNotifications={unreadCount}
          winnerSelectionPending={winnerSelectionPending}
          isDev={isDev}
          impersonation={impersonateVariant}
        >
          {children}
        </NewAppShell>
      </BasketProvider>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {autoCheckInPrompt}
      {isDev && (
        <DevToolsPanel
          isImpersonating={isImpersonating}
          impersonateVariant={impersonateVariant}
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
            <BasketProvider>{children}</BasketProvider>
          </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
