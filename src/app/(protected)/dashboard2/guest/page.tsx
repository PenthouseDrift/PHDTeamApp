import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getWallet } from "@/actions/wallet";
import { getSelfCheckInStatus } from "@/actions/admin/checkins";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { parseDiscounts, priceFor, formatGBP } from "@/lib/pricing";
import { GuestCheckInClient } from "@/components/dashboard2/GuestCheckInClient";

export const dynamic = "force-dynamic";

interface Dashboard2GuestPageProps {
  searchParams: Promise<{ checkout_id?: string; guestName?: string; guestPassType?: string }>;
}

/**
 * Guest / buddy check-in page for the /dashboard2 option. Also the return
 * target for "buy a pass for my guest" payments: on return it verifies the
 * SumUp checkout, runs the idempotent finalizer (credits the wallet), then
 * checks the named guest in — so the check-in step can't be forgotten.
 */
export default async function Dashboard2GuestPage({ searchParams }: Dashboard2GuestPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;
  const params = await searchParams;

  // ── Return-from-SumUp verification (no silent check-in) ──────────────────
  // We credit the pass, then ask the member to check their guest in with one tap
  // (the form is prefilled) — same "ask them to check in now" rule as Home.
  let message: string | null = null;
  let prefillName = (params.guestName ?? "").trim().slice(0, 60);
  let prefillType: "day_pass" | "rental" = params.guestPassType === "rental" ? "rental" : "day_pass";
  let targetCheckoutId = params.checkout_id;
  if (!targetCheckoutId) {
    targetCheckoutId =
      ((await redis.get(`pending_wallet_checkout:${userId}`)) as string) ||
      ((await redis.get(`pending_checkout:${userId}`)) as string);
  }
  if (targetCheckoutId) {
    const checkout = await getCheckoutStatus(targetCheckoutId);
    const statusUpper = (checkout?.status || "").toUpperCase();
    if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
      const payRes = await processSuccessfulPaymentReference(checkout.checkout_reference, checkout.id);
      await redis.del(`pending_wallet_checkout:${userId}`);
      await redis.del(`pending_checkout:${userId}`);

      // Prefer the guest name stored server-side with the checkout; the query
      // param is only a fallback (matches the classic flow).
      const guestName = (payRes.guestName || params.guestName || "").trim().slice(0, 60);
      if (guestName) {
        prefillName = guestName;
        prefillType = payRes.itemType === "rental" || params.guestPassType === "rental" ? "rental" : "day_pass";
        message = `Payment received — tap below to check ${guestName} in.`;
      } else {
        message = "Payment received and added to your wallet.";
      }
    }
  }

  const [walletRes, selfCheckInActive, memberData] = await Promise.all([
    getWallet(userId),
    getSelfCheckInStatus(),
    redis.hgetall(`member:${userId}`),
  ]);
  const wallet = walletRes.success ? walletRes.data : { dayPasses: 0, rentalHours: 0 };
  const discounts = parseDiscounts(memberData);
  const dayPassPrice = priceFor("daypass", discounts.daypass);
  const rentalPrice = priceFor("rental", discounts.rental);

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl space-y-5">
        <Link
          href="/dashboard2"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span>←</span> Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Check in a guest</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Bringing a friend to the track? Use a pass from your wallet, or buy one for them.
          </p>
        </div>

        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="text-lg">✅</span>
            <span>{message}</span>
          </div>
        )}

        <GuestCheckInClient
          userId={userId}
          selfCheckInActive={selfCheckInActive}
          dayPasses={wallet.dayPasses}
          rentalHours={wallet.rentalHours}
          dayPassPrice={formatGBP(dayPassPrice.final)}
          rentalPrice={formatGBP(rentalPrice.final)}
          initialGuestName={prefillName || undefined}
          initialPassType={prefillType}
        />
      </div>
    </div>
  );
}
