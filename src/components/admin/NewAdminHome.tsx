import Link from "next/link";
import { getTodayCheckIns, getSelfCheckInStatus } from "@/actions/admin/checkins";
import { getActiveRentals } from "@/actions/admin/rentals";
import { getUpcomingEvents } from "@/actions/events";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { getActiveShopOrders } from "@/actions/orders";
import { getReservedListings } from "@/actions/marketplace";
import { getReservationContext } from "@/actions/marketplace-reservations";
import { getUnpaidSummary } from "@/actions/admin/unpaid";
import { UnpaidPanel } from "@/components/admin/UnpaidPanel";
import { ShellIcon } from "@/components/new-shell/shell-icons";
import { getEventTiming } from "@/lib/event-utils";

/**
 * "Today" for staff in the new experience. It answers three questions in
 * order: what's happening (event + self check-in), what do I do right now
 * (check someone in), and is anything wrong (unpaid, overdue rentals, winner).
 *
 * It deliberately skips the full member scan the classic home page does just to
 * show "Total members": that's one SCAN plus three reads per member on every
 * load. Member totals live on the Members page.
 */

function londonToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });
  return `${map.year}-${map.month}-${map.day}`;
}

/** Server-side snapshot of how many running rentals have passed their end time. */
function countOverdue(rentals: Array<{ sessionEndsAt?: number | null }>): number {
  const now = Date.now();
  return rentals.filter((r) => r.sessionEndsAt && now > r.sessionEndsAt).length;
}

/** "For Sam ×1, Alex ×2" plus any older holds that aren't tied to a member. */
function holdersText(
  reservations: Array<{ holderName?: string; quantity: number }> | undefined,
  totalHeld: number
): string {
  const named = reservations ?? [];
  const namedQty = named.reduce((s, r) => s + r.quantity, 0);
  const parts = named.map((r) => `${r.holderName ?? "Member"} ×${r.quantity}`);
  if (totalHeld > namedQty) parts.push(`no member ×${totalHeld - namedQty}`);
  return parts.length > 0 ? `For ${parts.join(", ")}` : "";
}

export async function NewAdminHome({ isModerator }: { isModerator: boolean }) {
  const [todayCheckIns, activeRentals, events, selfCheckInOpen, winnerInfo, orders, reserved, reservationCtx, unpaidGroups] = await Promise.all([
    getTodayCheckIns(),
    getActiveRentals(),
    getUpcomingEvents(),
    getSelfCheckInStatus(),
    isModerator ? Promise.resolve(null) : getCurrentWeekWinnerInfo(),
    // Admin-gated inside the action; [] for moderators.
    getActiveShopOrders(),
    // Admin-gated too: marketplace items held for a buyer. [] for moderators.
    getReservedListings(),
    // Admin only: who each reservation is held for ({} for moderators).
    getReservationContext(),
    // Every outstanding unpaid check-in, from any event.
    getUnpaidSummary(),
  ]);

  const today = londonToday();
  const live = events.filter((e) => e.status !== "cancelled");
  const todaysEvents = live.filter((e) => e.date === today);
  const featured = todaysEvents[0] ?? live[0] ?? null;
  const timing = featured ? getEventTiming(featured) : null;

  const reservedUnits = reserved.reduce((sum, l) => sum + l.reservedCount, 0);

  const unpaid = todayCheckIns.filter((c) => c.unpaid).length;
  const runningRentals = activeRentals.filter((r) => r.status === "active");
  const overdue = countOverdue(runningRentals);

  const day = new Date().getDay();
  const winnerDue = !isModerator && (day === 0 || day === 6) && winnerInfo !== null && !winnerInfo.shellId;

  const alerts: Array<{ key: string; icon: string; title: string; desc: string; href: string; urgent: boolean }> = [];
  if (overdue > 0) {
    alerts.push({
      key: "overdue",
      icon: "⏱️",
      title: `${overdue} rental${overdue === 1 ? "" : "s"} over time`,
      desc: "These sessions have passed their time limit.",
      href: "/admin/check-in",
      urgent: true,
    });
  }
  if (winnerDue) {
    alerts.push({
      key: "winner",
      icon: "🏆",
      title: "Pick this week's showcase winner",
      desc: day === 0 ? "Last chance before the week resets." : "Voting is closed, so you can choose now.",
      href: "/admin/showcase-winners",
      urgent: day === 0,
    });
  }

  const links: Array<{ href: string; icon: string; title: string; desc: string; badge?: number }> = [
    { href: "/admin/members", icon: "👥", title: "Members", desc: "Look someone up or manage a membership" },
    { href: "/marketplace", icon: "🏷️", title: "Mark item as sold", desc: "Open the marketplace" },
  ];
  if (!isModerator) {
    links.push({ href: "/admin/activity", icon: "📊", title: "Reports", desc: "Revenue, activity and history" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:px-6">
      {/* What's happening */}
      <section
        aria-label="Today's event"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        {featured && timing ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {todaysEvents.length > 0 ? "Today" : "Next event"}
              </p>
              <h2 className="truncate text-lg font-black text-zinc-900 dark:text-zinc-100">{featured.title}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {todaysEvents.length > 0 ? "" : `${new Date(featured.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · `}
                {featured.openTime && featured.closeTime ? `${featured.openTime} to ${featured.closeTime}` : featured.time}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${timing.badgeBg} ${timing.badgeText}`}>{timing.label}</span>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming events scheduled.</p>
        )}
        <p className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <span
            className={`h-2.5 w-2.5 rounded-full ${selfCheckInOpen ? "bg-emerald-500" : "bg-zinc-400"}`}
            aria-hidden
          />
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            Member self check-in is {selfCheckInOpen ? "open" : "closed"}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">· follows the event times</span>
        </p>
      </section>

      {/* What to do right now */}
      <Link
        href="/admin/check-in"
        className="flex min-h-20 items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 p-5 text-white shadow-md transition-all hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.99]"
      >
        <span>
          <span className="block text-xl font-black">Check someone in</span>
          <span className="block text-sm font-medium text-emerald-50/90">Search, tap, done</span>
        </span>
        <span className="text-3xl" aria-hidden>
          →
        </span>
      </Link>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "Checked in", value: todayCheckIns.length, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "Unpaid", value: unpaid, tone: unpaid > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-400" },
          { label: "Rentals running", value: runningRentals.length, tone: "text-blue-600 dark:text-blue-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <dd className={`text-2xl font-black ${s.tone}`}>{s.value}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{s.label}</dt>
          </div>
        ))}
      </dl>

      {/* Click & Collect: orders waiting to be handed over and items held for a buyer. */}
      {!isModerator && (
        <section
          aria-label="Click and Collect"
          className="overflow-hidden rounded-2xl border border-emerald-300/70 bg-white shadow-sm dark:border-emerald-500/30 dark:bg-zinc-900"
        >
          <Link
            href="/admin/click-collect"
            className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3.5 transition-colors hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShellIcon name="basket" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">Click &amp; Collect</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {orders.length === 0 && reservedUnits === 0 ? "Nothing waiting" : "Orders and reserved items"}
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-emerald-700 dark:text-emerald-400">Open →</span>
          </Link>

          <div className="space-y-4 p-4">
            {/* At a glance */}
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-500/10">
                <dd className="text-2xl font-black leading-none text-emerald-700 dark:text-emerald-400">{orders.length}</dd>
                <dt className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800/70 dark:text-emerald-300/70">
                  To collect
                </dt>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-500/10">
                <dd className="text-2xl font-black leading-none text-amber-700 dark:text-amber-400">{reservedUnits}</dd>
                <dt className="mt-1 text-[11px] font-bold uppercase tracking-wide text-amber-800/70 dark:text-amber-300/70">
                  Reserved
                </dt>
              </div>
            </dl>

            {orders.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Awaiting collection
                </h3>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {orders.slice(0, 4).map((o) => {
                    const count = o.items.reduce((n, i) => n + i.quantity, 0);
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {o.userName ?? "Member"}
                          </span>
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                            {count} item{count === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            o.status === "ready_for_collection"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {o.status === "ready_for_collection" ? "Ready" : "Processing"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {orders.length > 4 && (
                  <p className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">+ {orders.length - 4} more</p>
                )}
              </div>
            )}

            {reserved.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Reserved items
                </h3>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {reserved.slice(0, 4).map((l) => {
                    const holders = holdersText(reservationCtx.all[l.listingId], l.reservedCount);
                    return (
                      <li key={l.listingId} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{l.title}</span>
                          {holders && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{holders}</span>}
                        </span>
                        <span
                          className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                          aria-label={`${l.reservedCount} reserved`}
                        >
                          ×{l.reservedCount}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {reserved.length > 4 && (
                  <p className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">+ {reserved.length - 4} more</p>
                )}
              </div>
            )}

            {orders.length === 0 && reserved.length === 0 && (
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">No orders to hand over and nothing on hold.</p>
            )}
          </div>

          {/* Second destination: the marketplace itself (browse, mark items as sold). */}
          <Link
            href="/marketplace"
            className="flex min-h-12 items-center justify-between gap-2 border-t border-zinc-100 px-4 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-50 dark:border-zinc-800 dark:text-teal-300 dark:hover:bg-teal-500/10"
          >
            <span className="flex items-center gap-2.5">
              <ShellIcon name="market" className="h-5 w-5" />
              Open the marketplace
            </span>
            <span aria-hidden>→</span>
          </Link>
        </section>
      )}

      {/* People who checked in without paying (any event). Hidden when nobody owes. */}
      <UnpaidPanel groups={unpaidGroups} />

      {/* Is anything wrong */}
      {alerts.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Needs attention</h2>
          {alerts.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                a.urgent
                  ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/15"
                  : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15"
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {a.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">{a.title}</span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">{a.desc}</span>
              </span>
              <span aria-hidden className="text-zinc-400">
                →
              </span>
            </Link>
          ))}
        </section>
      )}

      <section aria-label="Shortcuts" className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Shortcuts</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors hover:border-amber-400/60 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl dark:bg-zinc-800" aria-hidden>
                {l.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">{l.title}</span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{l.desc}</span>
              </span>
              {l.badge ? (
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-500 px-2 text-sm font-black text-black">
                  {l.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
