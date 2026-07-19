"use client";

import { useRouter } from "next/navigation";
import type { AppNotification } from "@/actions/notifications";

interface NotificationListProps {
  notifications: AppNotification[];
}

function getIcon(type: AppNotification["type"]): string {
  switch (type) {
    case "like": return "👍";
    case "comment": return "💬";
    case "reply": return "↩️";
    case "comment_like": return "👍";
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

export function NotificationList({ notifications }: NotificationListProps) {
  const router = useRouter();

  function handleClick(shellId: string) {
    router.push(`/showcase?open=${shellId}`);
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <button
          key={n.notificationId}
          onClick={() => handleClick(n.shellId)}
          className={`w-full text-left rounded-xl p-4 border transition-colors ${
            n.read
              ? "bg-white border-zinc-200"
              : "bg-blue-50 border-blue-200"
          } hover:bg-zinc-50`}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">{getIcon(n.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-900">{n.message}</p>
              <p className="text-xs text-zinc-400 mt-1">{formatTime(n.createdAt)}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
