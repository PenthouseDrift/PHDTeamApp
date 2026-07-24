"use client";

import { useState, useTransition } from "react";
import { updateNickname } from "@/actions/profile";

interface ProfileNicknameFormProps {
  userId: string;
  initialNickname?: string | null;
}

export function ProfileNicknameForm({ userId, initialNickname }: ProfileNicknameFormProps) {
  const [nickname, setNickname] = useState(initialNickname || "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const res = await updateNickname(userId, nickname);
      if (res.success) {
        setMessage({ type: "success", text: "Nickname saved successfully!" });
      } else {
        setMessage({ type: "error", text: res.error || "Failed to update nickname" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <div>
        <label htmlFor="nickname" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
          Track Nickname
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. DriftKing, Speedy, Ash"
          maxLength={30}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          This nickname will be displayed across the app instead of your full name.
        </p>
      </div>

      {message && (
        <p className={`text-xs font-semibold ${message.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save Nickname"}
      </button>
    </form>
  );
}
