import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnreadCount } from "@/actions/notifications";
import { AdminNavigation } from "@/components/AdminNavigation";
import { NewAdminShell } from "@/components/admin-shell/NewAdminShell";
import { getDashboardVersion } from "@/lib/dashboard-pref";

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
    const unread = await getUnreadCount(session.user.id);
    const sessionUser = session.user as typeof session.user & { customAvatar?: string | null };
    customAvatar = sessionUser.customAvatar || null;
    unreadCount = unread;
  } catch {
    // Silently handle errors
  }

  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  // Staff who opted into the new experience get the matching admin shell. One
  // cached HGET (shared with any page that also asks), classic stays as-is.
  let useNewShell = false;
  try {
    useNewShell = (await getDashboardVersion(session.user.id)) === "new";
  } catch {
    // Fall back to the classic shell.
  }

  if (useNewShell) {
    return (
      <NewAdminShell user={userWithAvatar} unreadNotifications={unreadCount}>
        {children}
      </NewAdminShell>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminNavigation user={userWithAvatar} unreadNotifications={unreadCount} />
      <main className="pwa-admin-content flex-1 overflow-y-auto md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
