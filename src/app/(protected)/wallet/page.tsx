import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWallet, addDayPasses, addRentalHours, createWalletCheckout } from "@/actions/wallet";
import { getMembership } from "@/actions/membership";
import { getCheckoutStatus } from "@/lib/sumup";
import { logActivity } from "@/lib/activity";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { redis } from "@/lib/redis";
import { parseDiscounts, priceFor } from "@/lib/pricing";
import { WalletClient } from "./WalletClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ checkout_id?: string }>;
}

export default async function WalletPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const userId = session.user.id;
  const params = await searchParams;

  // Instant fallback verification when customer returns from SumUp checkout
  let targetCheckoutId = params.checkout_id;
  if (!targetCheckoutId) {
    targetCheckoutId = (await redis.get(`pending_wallet_checkout:${userId}`)) as string | undefined;
  }

  if (targetCheckoutId) {
    const checkout = await getCheckoutStatus(targetCheckoutId);
    if (checkout && (checkout.status === "PAID" || checkout.status === "SUCCESSFUL")) {
      await processSuccessfulPaymentReference(checkout.checkout_reference, checkout.id);
      await redis.del(`pending_wallet_checkout:${userId}`);
    }
  }

  const [walletRes, membershipRes] = await Promise.all([
    getWallet(userId),
    getMembership(userId),
  ]);

  const wallet = walletRes.success
    ? walletRes.data
    : { userId, dayPasses: 0, rentalHours: 0, updatedAt: Date.now() };

  const membership = membershipRes.success ? membershipRes.data : null;

  async function handlePurchaseItem(itemType: "daypass" | "rental", quantity: number) {
    "use server";

    const session = await auth();
    if (!session?.user) redirect("/auth/signin");

    const result = await createWalletCheckout(session.user.id, itemType, quantity);
    if (result.success) {
      redirect(result.data.url);
    }
  }

  async function handleTestAddBalance(itemType: "daypass" | "rental", quantity: number) {
    "use server";

    const session = await auth();
    if (!session?.user) redirect("/auth/signin");

    if (itemType === "daypass") {
      await addDayPasses(session.user.id, quantity);
    } else {
      await addRentalHours(session.user.id, quantity);
    }

    const memberData = await redis.hgetall(`member:${session.user.id}`);
    const nickname = (memberData?.nickname as string) || "";
    const displayName = nickname.trim() || session.user.name || "Member";

    await logActivity({
      type: "purchase",
      memberId: session.user.id,
      memberName: displayName,
      description: `[DEV MODE] Simulated ${quantity}x ${itemType === "daypass" ? "Day Pass" : "Rental Hours"}`,
      amount: 0,
      currency: "GBP",
      isDev: true,
    });
  }

  const memberData = await redis.hgetall(`member:${userId}`);
  const nickname = (memberData?.nickname as string) || "";
  const displayName = nickname.trim() || session.user.name || "Member";

  const discounts = parseDiscounts(memberData);
  const pricing = {
    membership: priceFor("membership", discounts.membership),
    daypass: priceFor("daypass", discounts.daypass),
    rental: priceFor("rental", discounts.rental),
  };

  return (
    <WalletClient
      userId={userId}
      userName={displayName}
      userRole={session.user.role}
      wallet={wallet}
      membership={membership}
      pricing={pricing}
      onPurchaseItem={handlePurchaseItem}
      onTestAddBalance={process.env.NODE_ENV === "development" ? handleTestAddBalance : undefined}
    />
  );
}
