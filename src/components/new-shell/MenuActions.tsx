"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { setDashboardPreference } from "@/actions/profile";
import { QRPopover } from "@/components/QRPopover";
import { ShareButton } from "@/components/ShareButton";
import { ShellIcon, type ShellIconName } from "./shell-icons";

/** Client-side rows for the Menu page (they need handlers/popovers). */

const rowBase = "flex w-full items-center gap-3 px-4 py-3.5 text-left";

function RowIcon({ name }: { name: ShellIconName }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      <ShellIcon name={name} className="h-5 w-5" />
    </span>
  );
}

export function QrRow({ userId }: { userId: string }) {
  return (
    <div className={rowBase}>
      <RowIcon name="qr" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">My QR code</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">Backup check-in at the gate</span>
      </span>
      <QRPopover userId={userId} variant="button" buttonText="Show" />
    </div>
  );
}

export function ShareRow({ url }: { url: string }) {
  return (
    <div className={rowBase}>
      <RowIcon name="share" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">Share the app</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">Invite a friend to Penthouse Drift</span>
      </span>
      <ShareButton
        url={url}
        title="Penthouse Drift"
        text="Join me on Penthouse Drift — the RC drift track & community app."
        label="Share"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400"
      />
    </div>
  );
}

/** Turns the new experience off and returns to the classic dashboard. */
export function ClassicSwitchRow() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await setDashboardPreference("classic");
          // Only leave once the preference saved, otherwise /dashboard could
          // redirect straight back here.
          if (res.success) {
            router.push("/dashboard");
            router.refresh();
          }
        })
      }
      className={`${rowBase} transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-800/50`}
    >
      <RowIcon name="back" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {isPending ? "Switching…" : "Switch to the classic app"}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          Use the original layout instead (you can switch back in Profile)
        </span>
      </span>
    </button>
  );
}

export function SignOutRow() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={`${rowBase} transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50`}
    >
      <RowIcon name="logout" />
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sign out</span>
    </button>
  );
}
