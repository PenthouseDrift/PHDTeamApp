"use client";

import { useTransition } from "react";
import { toggleImpersonation } from "@/actions/dev";
import { useRouter } from "next/navigation";

export function DevImpersonationToggle({ 
  isImpersonating, 
  realRole,
  className
}: { 
  isImpersonating: boolean;
  realRole: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (process.env.NODE_ENV !== "development") return null;
  if (!isImpersonating && realRole === "member") return null;

  return (
    <button
      onClick={() => {
        startTransition(async () => {
          await toggleImpersonation(!isImpersonating);
          router.refresh();
        });
      }}
      disabled={isPending}
      title={isImpersonating ? "Revert to Admin" : "Impersonate Member"}
      className={`relative p-2 rounded-full transition-colors ${
        isImpersonating
          ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 animate-pulse"
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      } ${className || ""}`}
    >
      <span className="text-base leading-none block">{isImpersonating ? "👤" : "🕵️‍♂️"}</span>
    </button>
  );
}
