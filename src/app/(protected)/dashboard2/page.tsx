import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMemberHash } from "@/lib/dashboard-pref";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getWallet } from "@/actions/wallet";
import { parseDiscounts, priceFor, formatGBP, MEMBERSHIP_DURATION_DAYS } from "@/lib/pricing";
import { getRemainingDays, getMembershipProgress } from "@/lib/membership-utils";
import { parseAutoCheckInPrefs } from "@/lib/auto-checkin-prefs";
import { isUserCheckedInToday, getSelfCheckInStatus } from "@/actions/admin/checkins";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { getUpcomingEvents, getBulkEventRSVPs } from "@/actions/events";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { getAsboRcReport } from "@/actions/asbo-rc";
import { AsboRcReportsSummary } from "@/components/asbo-rc/AsboRcReportsSummary";
import { CheckInPanel } from "@/components/new-shell/CheckInPanel";
import { MembershipCard } from "@/components/new-shell/MembershipCard";
import type { Product } from "@/components/new-shell/useCheckoutFlow";
import { EventsSection } from "@/components/dashboard2/EventCards";
import { ShareAppCard } from "@/components/dashboard2/ShareAppCard";
import { CardsPromo } from "@/components/dashboard2/CardsPromo";
import { getCardCredits } from "@/lib/card-credits";
import { StaffQuickAccess } from "@/components/dashboard2/StaffQuickAccess";

export const dynamic = "force-dynamic";

const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

interface HomePageProps {
  searchParams: Promise<{ checkout_id?: string }>;
}

/**
 * Home for the new experience. One job: get the member on track.
 *
 *  1. If they've just come back from paying, verify + credit the payment (the
 *     idempotent finalizer) and ask them to CHECK IN NOW. We deliberately do not
 *     silently spend the pass for them.
 *  2. Show the check-in panel (one big action when they own an entry, clear buy
 *     options when they don't).
 *  3. Then what's on: events, and an invite card.
 * Everything else (cars, market, passes, menu) is one tap away in the shell.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;
  const sessionStaff = session.user.role === "admin" || session.user.role === "moderator";
  const isAsboRc = session.user.role === "asbo-rc";
  const params = await searchParams;

  // ── Return from payment: verify + credit, then ask them to check in ──────
  let justPaid: Product | null = null;
  let autoCheckedIn = false;
  let guestPaid: { name: string; type: "day_pass" | "rental" } | null = null;

  let pendingId = params.checkout_id;
  if (!pendingId) {
    // Both pointers in one command (this runs on every Home view).
    const [walletPending, checkoutPending] = await redis.mget<[string | null, string | null]>(
      `pending_wallet_checkout:${userId}`,
      `pending_checkout:${userId}`
    );
    pendingId = walletPending || checkoutPending || undefined;
  }
  if (pendingId) {
    const checkout = await getCheckoutStatus(pendingId);
    const status = (checkout?.status || "").toUpperCase();
    if (checkout && (status === "PAID" || status === "SUCCESSFUL")) {
      const payRes = await processSuccessfulPaymentReference(checkout.checkout_reference, checkout.id);
      await redis.del(`pending_wallet_checkout:${userId}`);
      await redis.del(`pending_checkout:${userId}`);

      const guestName = (payRes.guestName || "").trim().slice(0, 60);
      if (guestName && (payRes.itemType === "daypass" || payRes.itemType === "rental")) {
        guestPaid = { name: guestName, type: payRes.itemType === "rental" ? "rental" : "day_pass" };
      } else if (payRes.itemType === "membership" || payRes.itemType === "daypass" || payRes.itemType === "rental") {
        justPaid = payRes.itemType;
        autoCheckedIn = Boolean(payRes.autoCheckedIn);
      }
      // Marketplace payments share the pending_checkout key: they're finalised
      // above and have nothing to do with check-in, so no prompt for those.
    }
  }

  const [membershipRes, walletRes, memberData, alreadyCheckedIn, selfCheckInActive, upcomingEvents, winnerInfo, asboRcReport] =
    await Promise.all([
      getMembership(userId),
      getWallet(userId),
      getMemberHash(userId),
      isUserCheckedInToday(userId),
      getSelfCheckInStatus(),
      // Cached for 60s inside getUpcomingEvents, so this adds no DB load per view.
      getUpcomingEvents(),
      sessionStaff ? getCurrentWeekWinnerInfo() : Promise.resolve(null),
      isAsboRc ? getAsboRcReport() : Promise.resolve(null),
    ]);

  // Always trust the live Redis role (unless dev impersonation is active) so demoted moderators lose staff check-in immediately.
  const isImpersonating = Boolean((session.user as { realRole?: string }).realRole);
  const liveRole = isImpersonating
    ? session.user.role
    : ((memberData?.role as string) || session.user.role);
  const isStaff = liveRole === "admin" || liveRole === "moderator";
  const isModerator = liveRole === "moderator";
  const eventRsvps = await getBulkEventRSVPs(
    upcomingEvents.map((e) => e.eventId),
    userId
  );

  // getMembership already applies the dev "member with membership" tool.
  const membership = membershipRes.success ? membershipRes.data : null;
  const wallet = walletRes.success ? walletRes.data : { dayPasses: 0, rentalHours: 0 };
  const isActive = membership?.status === "active";
  const daysLeft = membership && isActive ? getRemainingDays(membership) : 0;

  const autoPrefs = parseAutoCheckInPrefs(memberData);
  const discounts = parseDiscounts(memberData);
  const prices = {
    daypass: formatGBP(priceFor("daypass", discounts.daypass).final),
    rental: formatGBP(priceFor("rental", discounts.rental).final),
    membership: formatGBP(priceFor("membership", discounts.membership).final),
  };

  const membershipState: "none" | "active" | "expired" = isActive ? "active" : membership ? "expired" : "none";
  const progress = membership && isActive ? getMembershipProgress(membership, MEMBERSHIP_DURATION_DAYS) : null;

  const nickname = ((memberData?.nickname as string) || "").trim();
  const firstName = nickname || session.user.name?.split(" ")[0] || "there";

  const dayOfWeek = new Date().getDay();
  const winnerSelectionPending =
    isStaff && (dayOfWeek === 0 || dayOfWeek === 6) && Boolean(winnerInfo && !winnerInfo.shellId);

  const statusLine = isStaff
    ? `${isModerator ? "Moderator" : "Admin"} · unlimited access`
    : isActive
    ? daysLeft === 0
      ? "Membership · last day today"
      : `Membership · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
    : "No active membership";

  // One component, two placements: inside the check-in card while the
  // membership is active, or as its own card to join / renew.
  const membershipCard = (embedded = false) => (
    <MembershipCard
      embedded={embedded}
      userId={userId}
      state={membershipState}
      daysLeft={daysLeft}
      percentLeft={progress?.percentLeft ?? 0}
      startedLabel={membership && isActive ? shortDate(membership.purchasedAt) : null}
      endsLabel={membership ? shortDate(membership.expiresAt) : null}
      membershipPrice={priceFor("membership", discounts.membership).final}
      daypassPrice={priceFor("daypass", discounts.daypass).final}
      membershipDays={MEMBERSHIP_DURATION_DAYS}
    />
  );
  // Read after the check-in above has run, so a credit earned just now is counted.
  const cardCredits = await getCardCredits(userId);
  const membershipActiveBlock = !isStaff && membershipState === "active" ? membershipCard(true) : undefined;

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Hey {firstName}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{statusLine}</p>
        </div>

        {isAsboRc && asboRcReport && <AsboRcReportsSummary report={asboRcReport} detailHref="/asbo-rc" />}

        {isStaff && <StaffQuickAccess winnerSelectionPending={winnerSelectionPending} />}

        {/* A pass bought FOR A GUEST: ask the member to check the guest in now. */}
        {guestPaid && (
          <section className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/30">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden>
                ✅
              </span>
              <div>
                <h2 className="text-base font-black text-emerald-900 dark:text-emerald-200">Payment received</h2>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Your {guestPaid.type === "rental" ? "rental hour" : "day pass"} for {guestPaid.name} is ready. Check them in now.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard2/guest?guestName=${encodeURIComponent(guestPaid.name)}&guestPassType=${guestPaid.type}`}
              className="block rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Check {guestPaid.name} in now
            </Link>
          </section>
        )}

        <CheckInPanel
          footer={membershipActiveBlock}
          userId={userId}
          userName={nickname || session.user.name || "Member"}
          isStaff={isStaff}
          selfCheckInActive={selfCheckInActive}
          alreadyCheckedIn={alreadyCheckedIn}
          isMembershipActive={Boolean(isActive)}
          membershipDaysLeft={daysLeft}
          dayPasses={wallet.dayPasses}
          rentalHours={wallet.rentalHours}
          prices={prices}
          justPaid={justPaid}
          autoCheckedIn={
            // This request did it, or the webhook beat us to it and they're already in.
            autoCheckedIn ||
            Boolean(
              justPaid &&
                alreadyCheckedIn &&
                ((justPaid === "daypass" && autoPrefs.dayPass === true) || (justPaid === "rental" && autoPrefs.rental === true))
            )
          }
        />

        <CardsPromo credits={cardCredits} />
        {/* Join / renew prompts get their own card. (Active members see their
            time-left bar inside the check-in card above.) */}
        {!isStaff && membershipState !== "active" && membershipCard()}

        <EventsSection events={upcomingEvents} rsvps={eventRsvps} />

        <ShareAppCard />
      </div>
    </div>
  );
}
