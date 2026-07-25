import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { redis } from "@/lib/redis";
import { isUserCheckedInToday } from "@/actions/admin/checkins";
import { SelfCheckInClient } from "@/components/SelfCheckInClient";

export const dynamic = "force-dynamic";

export default async function TrackCheckInPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/track-checkin");
  }

  const userId = session.user.id;
  const now = Date.now();

  const [memberData, membershipData, walletData, alreadyCheckedIn] = await Promise.all([
    redis.hgetall(`member:${userId}`),
    redis.hgetall(`membership:${userId}`),
    redis.hgetall(`wallet:${userId}`),
    isUserCheckedInToday(userId),
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
      <SelfCheckInClient
        userId={userId}
        userName={userName}
        isMembershipActive={Boolean(isMembershipActive)}
        membershipExpiresAt={membershipExpiresAt}
        dayPasses={dayPasses}
        rentalHours={rentalHours}
        alreadyCheckedIn={alreadyCheckedIn}
      />
    </div>
  );
}
