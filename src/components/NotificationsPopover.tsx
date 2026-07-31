import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  deleteNotification,
  clearAllNotifications,
  type AppNotification,
} from "@/actions/notifications";

interface NotificationsPopoverProps {
  userId: string;
  initialUnreadCount?: number;
}

function getIcon(type: AppNotification["type"]): string {
  switch (type) {
    case "like": return "👍";
    case "comment": return "💬";
    case "reply": return "↩️";
    case "comment_like": return "👍";
    case "global": return "📢";
    case "event_reminder": return "🏎️";
    default: return "🔔";
  }
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function NotificationsPopover({ userId, initialUnreadCount = 0 }: NotificationsPopoverProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // Initial load effect already handled the first fetch, and clicking the bell will trigger fetch explicitly.

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Load notifications when opened
  useEffect(() => {
    if (!isOpen || !userId) return;
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await getNotifications(userId);
        if (isMounted) {
          setNotifications(data);
          
          // Also fetch fresh unread count just in case
          const count = await getUnreadCount(userId);
          setUnreadCount(count);
        }
      } catch (err) {
        console.error("Failed to load notifications", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  async function handleOpen() {
    if (isOpen) { setIsOpen(false); return; }
    setIsOpen(true);
    if (unreadCount > 0) {
      setUnreadCount(0);
      void markAllRead(userId);
    }
  }

  async function handleClearAll() {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await clearAllNotifications(userId);
    } catch (err) {
      console.error("Failed to clear notifications:", err);
    }
  }

  async function handleDeleteOne(e: React.MouseEvent, notificationId: string) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.notificationId !== notificationId));
    try {
      await deleteNotification(userId, notificationId);
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }

  function handleNotificationClick(item: AppNotification) {
    setIsOpen(false);
    if (item.url) {
      router.push(item.url);
    } else if (
      item.targetType === "post" ||
      item.postId ||
      item.message.toLowerCase().includes("post")
    ) {
      router.push("/newsfeed");
    } else if (item.shellId || item.targetType === "shell") {
      router.push(`/showcase?open=${item.shellId}`);
    } else if (item.type === "global" || item.type === "event_reminder") {
      router.push("/newsfeed");
    } else {
      router.push("/dashboard");
    }
  }

  const panelContent = (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notifications</h3>
          {notifications.length > 0 && (
            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
              {notifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 text-sm font-bold ml-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[350px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {loading ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-zinc-400">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center space-y-1">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">No Notifications</p>
            <p className="text-[11px] text-zinc-400">Nothing in the past 7 days.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.notificationId}
              className="group relative w-full text-left p-3.5 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
              onClick={() => handleNotificationClick(n)}
            >
              <span className="text-xl shrink-0 mt-0.5">{getIcon(n.type)}</span>
              <div className="flex-1 min-w-0 pr-6">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                  {n.message}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1 font-medium">
                  {formatTime(n.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => handleDeleteOne(e, n.notificationId)}
                title="Clear notification"
                className="absolute top-3.5 right-3 opacity-60 group-hover:opacity-100 hover:text-red-500 text-zinc-400 p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-xs"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 text-center">
        <p className="text-[10px] text-zinc-400">Notifications expire after 7 days.</p>
      </div>
    </div>
  );

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative p-2 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors focus:outline-none"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-md animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Mobile: fixed panel drops down from the top header bar */}
          <div className="fixed top-14 left-0 right-0 z-[9999] px-3 pt-1 md:hidden">
            {panelContent}
          </div>

          {/* Desktop: compact dropdown anchored to bell, no overlay */}
          <div className="hidden md:block absolute left-0 top-full mt-2 w-96 z-[9999]">
            {panelContent}
          </div>
        </>
      )}
    </div>
  );
}
