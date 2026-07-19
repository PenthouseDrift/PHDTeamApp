import { auth } from "@/lib/auth";
import { getNotifications, markAllRead } from "@/actions/notifications";
import { NotificationList } from "./NotificationList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const notifications = await getNotifications(session.user.id);

  // Mark all as read when viewing
  await markAllRead(session.user.id);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Notifications</h1>

        {notifications.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">No notifications yet</p>
          </div>
        ) : (
          <NotificationList notifications={notifications} />
        )}
      </div>
    </div>
  );
}
