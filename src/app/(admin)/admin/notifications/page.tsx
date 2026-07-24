import { auth } from "@/lib/auth";
import { getGlobalNotificationsHistory } from "@/actions/notifications";
import { GlobalNotificationForm } from "./GlobalNotificationForm";

export const dynamic = "force-dynamic";

export default async function GlobalNotificationsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return null;

  const history = await getGlobalNotificationsHistory(30);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Global Notifications</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Broadcast in-app and push notifications to all registered members
          </p>
        </div>

        {/* Global Notification Form */}
        <GlobalNotificationForm adminId={session.user.id} />

        {/* Sent History */}
        <section className="space-y-4 pt-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Broadcast History</h2>
          {history.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No global notifications sent yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-500">{entry.title}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{entry.message}</p>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                    <span>Target URL: <code className="text-zinc-700 dark:text-zinc-300">{entry.url}</code></span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      👥 {entry.recipientCount} {entry.recipientCount === 1 ? "Member" : "Members"} Notified
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
