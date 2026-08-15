import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnreadCount } from "@/actions/notifications";
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

  return (
    <div className="flex h-dvh bg-zinc-50 dark:bg-zinc-950">
      <AdminNavigation user={userWithAvatar} unreadNotifications={unreadCount} />
      <main className="pwa-admin-content flex-1 overflow-y-auto md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
