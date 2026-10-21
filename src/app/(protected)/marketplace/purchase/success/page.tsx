import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { ClearBasketOnMount } from "@/components/marketplace/ClearBasketOnMount";

export const dynamic = "force-dynamic";

interface PageProps {
  // SumUp may append a checkout id on redirect; we also fall back to the
  // per-user pending key written at checkout creation.
  searchParams: Promise<{ checkout_id?: string; id?: string }>;
}

export default async function MarketplacePurchaseSuccessPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const params = await searchParams;

  // Prefer an explicit checkout id from the redirect; otherwise use the
  // per-user pending key stored when the checkout was created.
  const targetCheckoutId =
    params.checkout_id ||
    params.id ||
    ((await redis.get(`pending_checkout:${session.user.id}`)) as string | undefined);

  let paid = false;
  let orderRef: string | null = null;

  if (targetCheckoutId) {
    const checkout = await getCheckoutStatus(targetCheckoutId);
    const statusUpper = (checkout?.status || "").toUpperCase();
    if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
      // Finalize immediately on return. Idempotent (guarded by
      // payment:processed:<id>), so it's a no-op if the webhook already ran.
      await processSuccessfulPaymentReference(
        checkout.checkout_reference || "",
        checkout.id || targetCheckoutId,
        Number(checkout.amount) || 0,
        checkout.currency || "GBP"
      );
      paid = true;
      orderRef = (checkout.id || targetCheckoutId).slice(0, 8).toUpperCase();
      // Clear the per-user pointer now it's been handled.
      await redis.del(`pending_checkout:${session.user.id}`);
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg space-y-6 pt-8">
        {paid ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center space-y-4 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Empty the client basket now the order is confirmed. */}
            <ClearBasketOnMount />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <svg className="h-8 w-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Payment received</h1>
            <p className="text-zinc-600 dark:text-zinc-300">
              Your order is confirmed and reserved. Speak to a member of staff at Penthouse Drift to collect it.
            </p>
            {orderRef && (
              <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Collection reference</p>
                <p className="text-xl font-black tracking-wider text-amber-600 dark:text-amber-400">{orderRef}</p>
              </div>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              We&apos;ve also emailed your confirmation. You can view this order any time under My Orders.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/orders"
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                View my orders
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Back to marketplace
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center space-y-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Finalising your order</h1>
            <p className="text-zinc-600 dark:text-zinc-300">
              Your payment is being confirmed. This usually takes a few seconds.
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Tap refresh if this doesn&apos;t update shortly — your order will also appear under My Orders.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/marketplace/purchase/success"
                className="inline-flex items-center justify-center rounded-xl bg-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Refresh
              </Link>
              <Link
                href="/orders"
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                View my orders
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
