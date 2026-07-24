import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWallet, addDayPasses, addRentalHours } from "@/actions/wallet";
import { getMembership } from "@/actions/membership";
import { generateQRCode } from "@/lib/qr";
import { getOrGeneratePassNonce } from "@/actions/qr";
import { createCheckout } from "@/lib/sumup";
import { redis } from "@/lib/redis";
import { WalletClient } from "./WalletClient";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const userId = session.user.id;

  const [walletRes, membershipRes, dayPassNonce, rentalNonce] = await Promise.all([
    getWallet(userId),
    getMembership(userId),
    getOrGeneratePassNonce(userId, "day_pass"),
    getOrGeneratePassNonce(userId, "rental"),
  ]);

  const [membershipQr, dayPassQr, rentalQr] = await Promise.all([
    generateQRCode(userId, "membership"),
    generateQRCode(userId, "day_pass", dayPassNonce),
    generateQRCode(userId, "rental", rentalNonce),
  ]);

  const wallet = walletRes.success
    ? walletRes.data
    : { userId, dayPasses: 0, rentalHours: 0, updatedAt: Date.now() };

  const membership = membershipRes.success ? membershipRes.data : null;

  async function handlePurchaseItem(itemType: "daypass" | "rental", quantity: number) {
    "use server";

    const session = await auth();
    if (!session?.user) redirect("/auth/signin");

    const unitPrice = 10.0;
    const totalAmount = quantity * unitPrice;
    const description =
      itemType === "daypass"
        ? `Penthouse Drift - ${quantity}x Day Pass`
        : `Penthouse Drift - ${quantity}x Car Rental Hour`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkout = await createCheckout({
      memberId: `${itemType}_${session.user.id}_${quantity}`,
      amount: totalAmount,
      currency: "GBP",
      description,
      returnUrl: `${baseUrl}/wallet`,
    });

    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: session.user.id,
        itemType,
        quantity,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 3600 }
    );

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    redirect(redirectUrl);
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
  }

  const memberData = await redis.hgetall(`member:${userId}`);
  const nickname = (memberData?.nickname as string) || "";
  const displayName = nickname.trim() || session.user.name || "Member";

  return (
    <WalletClient
      userId={userId}
      userName={displayName}
      userRole={session.user.role}
      wallet={wallet}
      membership={membership}
      membershipQrUrl={membershipQr}
      dayPassQrUrl={dayPassQr}
      rentalQrUrl={rentalQr}
      onPurchaseItem={handlePurchaseItem}
      onTestAddBalance={process.env.NODE_ENV === "development" ? handleTestAddBalance : undefined}
    />
  );
}
