import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCheckout } from "@/lib/sumup";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getRemainingDays } from "@/lib/membership-utils";
import { processSuccessfulMembershipPayment } from "@/lib/membership-activation";
import { PurchaseButton } from "./PurchaseButton";

export const dynamic = "force-dynamic";

const MEMBERSHIP_PRICE = 40.0;
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

    // Create checkout with memberId reference
    const checkout = await createCheckout({
      memberId: session.user.id,
      amount: MEMBERSHIP_PRICE,
      currency: MEMBERSHIP_CURRENCY,
      description: `Penthouse Drift - ${MEMBERSHIP_DURATION_DAYS}-Day Membership`,
      returnUrl: `${baseUrl}/membership/success`,
    });

    // Store checkout reference and user pending checkout temporarily for verification
    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: session.user.id,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 3600 } // expires in 1 hour
    );
    await redis.set(`pending_checkout:${session.user.id}`, checkout.id, { ex: 3600 });

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    redirect(redirectUrl);
  }

  async function handleTestBypass() {
    "use server";
    const session = await auth();
    if (!session?.user) {
      redirect("/auth/signin");
    }
    await processSuccessfulMembershipPayment(session.user.id, `test_dev_${Date.now()}`);
    redirect("/membership/success");
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Purchase Membership
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Get access to the Penthouse Drift RC track
          </p>
        </div>

        {/* Membership Info Card */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {MEMBERSHIP_DURATION_DAYS}-Day Track Membership
            </h2>
            <span className="text-2xl font-bold text-amber-500">
              £{MEMBERSHIP_PRICE.toFixed(2)}
            </span>
          </div>

          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            <li className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Full track access for {MEMBERSHIP_DURATION_DAYS} days</span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Instant personal QR code check-in on phone</span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Access car setups, calibrations & community features</span>
            </li>
          </ul>

          {isActive && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3.5 text-sm text-zinc-700 dark:text-zinc-200">
              <p>
                You currently have an active membership with{" "}
                <span className="font-semibold text-amber-500">
                  {remainingDays} {remainingDays === 1 ? "day" : "days"}
                </span>{" "}
                remaining. Purchasing now will extend your membership by{" "}
                {MEMBERSHIP_DURATION_DAYS} days from your current expiry.
              </p>
            </div>
          )}

          <form action={handlePurchase}>
            <PurchaseButton
              isActive={isActive}
              price={MEMBERSHIP_PRICE}
              durationDays={MEMBERSHIP_DURATION_DAYS}
            />
          </form>

          <div className="flex items-center justify-center gap-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secured by SumUp — Pay with Card, Apple Pay or Google Pay</span>
          </div>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Developer Test Mode
              </h3>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Test membership purchasing and QR activation locally without spending money or setting up SumUp API keys.
            </p>
            <form action={handleTestBypass}>
              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 shadow-sm"
              >
                Simulate Successful Payment (Dev Only)
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
