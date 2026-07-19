import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCheckout } from "@/lib/sumup";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getRemainingDays } from "@/lib/membership-utils";

export const dynamic = "force-dynamic";

const MEMBERSHIP_PRICE = 10.0;
const MEMBERSHIP_CURRENCY = "GBP";
const MEMBERSHIP_DURATION_DAYS = 28;

export default async function PurchaseMembershipPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const result = await getMembership(session.user.id);
  const membership = result.success ? result.data : null;
  const isActive = membership?.status === "active";
  const remainingDays =
    membership && isActive ? getRemainingDays(membership) : 0;

  async function handlePurchase() {
    "use server";

    const session = await auth();
    if (!session?.user) {
      redirect("/auth/signin");
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkout = await createCheckout({
      memberId: session.user.id,
      amount: MEMBERSHIP_PRICE,
      currency: MEMBERSHIP_CURRENCY,
      description: `Penthouse Drift - ${MEMBERSHIP_DURATION_DAYS}-Day Membership`,
      returnUrl: `${baseUrl}/membership/success`,
    });

    // Store checkout reference temporarily for verification
    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: session.user.id,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 3600 } // expires in 1 hour
    );

    if (checkout.hosted_checkout_url) {
      redirect(checkout.hosted_checkout_url);
    }

    // Fallback: redirect to SumUp checkout page using checkout id
    redirect(`https://pay.sumup.com/b2c/Q${checkout.id}`);
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Purchase Membership
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Get access to the Penthouse Drift RC track
          </p>
        </div>

        {/* Membership Info Card */}
        <div className="rounded-xl bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">
              {MEMBERSHIP_DURATION_DAYS}-Day Membership
            </h2>
            <span className="text-2xl font-bold text-amber-400">
              £{MEMBERSHIP_PRICE.toFixed(2)}
            </span>
          </div>

          <ul className="space-y-2 text-sm text-zinc-600">
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Full track access for {MEMBERSHIP_DURATION_DAYS} days
            </li>
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              QR code check-in at sessions
            </li>
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Access to all member features
            </li>
          </ul>

          {isActive && (
            <div className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600">
              <p>
                You currently have an active membership with{" "}
                <span className="font-medium text-amber-400">
                  {remainingDays} {remainingDays === 1 ? "day" : "days"}
                </span>{" "}
                remaining. Purchasing now will extend your membership by{" "}
                {MEMBERSHIP_DURATION_DAYS} days from your current expiry.
              </p>
            </div>
          )}

          <form action={handlePurchase}>
            <button
              type="submit"
              className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              {isActive
                ? `Renew Membership - £${MEMBERSHIP_PRICE.toFixed(2)}`
                : `Purchase ${MEMBERSHIP_DURATION_DAYS}-Day Membership - £${MEMBERSHIP_PRICE.toFixed(2)}`}
            </button>
          </form>

          <p className="text-center text-xs text-zinc-500">
            Secure payment powered by SumUp
          </p>
        </div>
      </div>
    </div>
  );
}
