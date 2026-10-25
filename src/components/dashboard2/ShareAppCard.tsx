import { ShareButton } from "@/components/ShareButton";

// Public base URL of the app, used for the invite link (same source as classic).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.penthousedrift.com").replace(/\/$/, "");

/**
 * Compact "invite a friend" row for the /dashboard2 option. Same behaviour as the
 * classic share section (real ShareButton: QR, native share sheet, copy link),
 * but a slimmer layout that doesn't dominate the page.
 */
export function ShareAppCard() {
  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-950/30 dark:to-orange-950/20">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Share Penthouse Drift</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Know someone who&apos;d love the track? Send them the app.
        </p>
      </div>
      <ShareButton
        url={APP_URL}
        title="Penthouse Drift"
        text="Join me on Penthouse Drift — the RC drift track & community app."
        label="Share"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 active:bg-amber-600"
      />
    </section>
  );
}
