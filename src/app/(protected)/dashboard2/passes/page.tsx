import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMemberHash } from "@/lib/dashboard-pref";
import { getMembership } from "@/actions/membership";
import { getWallet } from "@/actions/wallet";
import { getRemainingDays } from "@/lib/membership-utils";
import { MEMBERSHIP_DURATION_DAYS, parseDiscounts, priceFor } from "@/lib/pricing";
import { PassesClient } from "@/components/new-shell/PassesClient";

export const dynamic = "force-dynamic";

/**
 * Passes tab for the new experience: membership status, wallet balances and
 * every way to buy, in one place (replaces /wallet and /membership/purchase).
 * Purchases return to Home (/dashboard2), which verifies payment and prompts
 * the member to check in.
 */
export default async function PassesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;
  const isStaff = session.user.role === "admin" || session.user.role === "moderator";

  const [membershipRes, walletRes, memberData] = await Promise.all([
    getMembership(userId),
    getWallet(userId),
    getMemberHash(userId),
  ]);

  const membership = membershipRes.success ? membershipRes.data : null;
  const active = membership?.status === "active";
  const remainingDays = membership && active ? getRemainingDays(membership) : 0;
  const wallet = walletRes.success ? walletRes.data : { dayPasses: 0, rentalHours: 0 };

  const discounts = parseDiscounts(memberData);
  const pricing = {
    membership: priceFor("membership", discounts.membership),
    daypass: priceFor("daypass", discounts.daypass),
    rental: priceFor("rental", discounts.rental),
  };

  const expiresLabel =
    membership && active
      ? new Date(membership.expiresAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Passes</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your membership and wallet, and everything you need to get on track.
          </p>
        </div>

        <PassesClient
          userId={userId}
          isStaff={isStaff}
          isDev={process.env.NODE_ENV === "development"}
          membership={{
            active,
            remainingDays,
            isLastDay: Boolean(membership && active && remainingDays === 0),
            expiresLabel,
          }}
          wallet={{ dayPasses: wallet.dayPasses, rentalHours: wallet.rentalHours }}
          pricing={pricing}
          membershipDays={MEMBERSHIP_DURATION_DAYS}
        />
      </div>
    </div>
  );
}
