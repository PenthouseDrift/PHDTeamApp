import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { redis } from "@/lib/redis";
import { isUserCheckedInToday, getSelfCheckInStatus } from "@/actions/admin/checkins";
import { performSelfCheckIn, performGuestSelfCheckIn } from "@/actions/self-checkin";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { SelfCheckInClient } from "@/components/SelfCheckInClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ checkout_id?: string; checkout_reference?: string; autoCheckin?: string; guestName?: string; guestPassType?: string }>;
}

export default async function TrackCheckInPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/track-checkin");
  }

  const userId = session.user.id;
  const now = Date.now();
  const params = await searchParams;

  // 1. Case-insensitive Payment Verification on return from SumUp checkout
  let targetCheckoutId = params.checkout_id;
  if (!targetCheckoutId) {
    targetCheckoutId =
      ((await redis.get(`pending_wallet_checkout:${userId}`)) as string) ||
      ((await redis.get(`pending_checkout:${userId}`)) as string);
  }

  let autoCheckinMessage: string | null = null;

  if (targetCheckoutId) {
    const checkout = await getCheckoutStatus(targetCheckoutId);
    const statusUpper = (checkout?.status || "").toUpperCase();

    if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
      const payRes = await processSuccessfulPaymentReference(
        checkout.checkout_reference,
        checkout.id
      );

      await redis.del(`pending_wallet_checkout:${userId}`);
      await redis.del(`pending_checkout:${userId}`);

      const targetGuestName = payRes.guestName || params.guestName;

      if (targetGuestName?.trim()) {
        const guestMethod: "day_pass" | "rental" =
          payRes.itemType === "rental" || params.guestPassType === "rental" ? "rental" : "day_pass";

        const guestCheckinRes = await performGuestSelfCheckIn(
          userId,
          targetGuestName.trim(),
          guestMethod,
          true
        );
        if (guestCheckinRes.success) {
          autoCheckinMessage = `Payment Received via SumUp! ${guestCheckinRes.data.message}`;
        } else {
          autoCheckinMessage = `Payment Received via SumUp! Pass added to wallet. (${guestCheckinRes.error})`;
        }
      } else {
        const checkInMethod: "membership" | "day_pass" | "rental" =
          payRes.itemType === "daypass"
            ? "day_pass"
            : payRes.itemType === "rental"
            ? "rental"
            : "membership";

        const checkinRes = await performSelfCheckIn(userId, checkInMethod, true);
        if (checkinRes.success) {
          autoCheckinMessage = `Payment Received via SumUp! ${checkinRes.data.message}`;
        } else {
          autoCheckinMessage = `Payment Received via SumUp! Pass added to wallet. (${checkinRes.error})`;
        }
      }
    }
  }

  const [memberData, membershipData, walletData, alreadyCheckedIn, selfCheckinActive] = await Promise.all([
    redis.hgetall(`member:${userId}`),
    redis.hgetall(`membership:${userId}`),
    redis.hgetall(`wallet:${userId}`),
    isUserCheckedInToday(userId),
    getSelfCheckInStatus(),
  ]);

  const userName =
    (memberData?.nickname as string)?.trim() ||
    (memberData?.name as string) ||
    session.user.name ||
    "Racer";

  const isMembershipActive =
    membershipData && Number(membershipData.expiresAt) > now;
  const membershipExpiresAt = membershipData
    ? Number(membershipData.expiresAt)
    : null;

  const dayPasses = Math.max(0, Number(walletData?.dayPasses) || 0);
  const rentalHours = Math.max(0, Number(walletData?.rentalHours) || 0);

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">
      {autoCheckinMessage && (
        <div className="rounded-xl p-4 text-sm font-bold bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 text-emerald-800 dark:text-emerald-200 shadow-sm flex items-center gap-2">
          <span className="text-xl">✅</span>
          <span>{autoCheckinMessage}</span>
        </div>
      )}
      
      {!selfCheckinActive && !autoCheckinMessage ? (
        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 mb-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-100">
            Check-In Closed
          </h2>
          <p className="text-sm text-zinc-500 max-w-sm">
            Self check-in is currently closed. If there is a track event today, please see an admin at the track entrance to scan your QR code.
          </p>
        </div>
      ) : (
        <SelfCheckInClient
          userId={userId}
          userName={userName}
          isMembershipActive={Boolean(isMembershipActive)}
          membershipExpiresAt={membershipExpiresAt}
          dayPasses={dayPasses}
          rentalHours={rentalHours}
          alreadyCheckedIn={alreadyCheckedIn}
        />
      )}
    </div>
  );
}
