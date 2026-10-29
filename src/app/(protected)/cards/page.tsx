import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCardCredits } from "@/lib/card-credits";
import { listMyCards } from "@/actions/member-cards";
import { redis } from "@/lib/redis";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import {
  getDriftClashLeaderboard,
  getPlayerClashStats,
  hasClashEarlyAccess,
  pickClashOpponent,
} from "@/tcg/clash";
import {
  getPCredits,
  getTcgStoreConfig,
  listActiveMarketListings,
  listCustomPacks,
} from "@/tcg/storage";
import { TcgApp } from "@/tcg/components/TcgApp";
import type { TcgTab } from "@/tcg/types";

export const dynamic = "force-dynamic";
// A newly opened card can be re-rolled from the large view, which draws new art and can take a while.
export const maxDuration = 60;

interface CardsPageProps {
  searchParams: Promise<{ tab?: string; checkout_id?: string }>;
}

const VALID_TABS: TcgTab[] = [
  "collection",
  "clash",
  "store",
  "marketplace",
  "p-credits",
  "leaderboard",
];

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const userId = session.user.id;
  const params = await searchParams;

  // Verify any returning or pending SumUp P-Credits checkout immediately
  let checkoutConfirmed = false;
  let targetCheckoutId = params.checkout_id;
  if (!targetCheckoutId) {
    targetCheckoutId = (await redis.get(`pending_pcredits_checkout:${userId}`)) as
      | string
      | undefined;
  }

  if (targetCheckoutId) {
    try {
      const checkout = await getCheckoutStatus(targetCheckoutId);
      const statusUpper = (checkout?.status || "").toUpperCase();
      if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
        await processSuccessfulPaymentReference(
          checkout.checkout_reference || "",
          checkout.id || targetCheckoutId,
          Number(checkout.amount) || 0,
          checkout.currency || "GBP"
        );
        await redis.del(`pending_pcredits_checkout:${userId}`);
        checkoutConfirmed = true;
      }
    } catch (e) {
      console.error("[driftClash] P-Credits checkout return verification failed:", e);
    }
  }

  const [
    cards,
    packCredits,
    pCredits,
    storeConfig,
    customPacks,
    listings,
    clashOpponent,
    clashStats,
    leaderboard,
    hasEarlyAccess,
  ] = await Promise.all([
    listMyCards(),
    getCardCredits(userId),
    getPCredits(userId),
    getTcgStoreConfig(),
    listCustomPacks({ onlyLive: true }),
    listActiveMarketListings(),
    pickClashOpponent(userId),
    getPlayerClashStats(userId),
    getDriftClashLeaderboard(25),
    hasClashEarlyAccess(userId, session.user.role),
  ]);

  const requestedTab = params.tab as TcgTab | undefined;
  const initialTab: TcgTab =
    requestedTab && VALID_TABS.includes(requestedTab)
      ? requestedTab
      : checkoutConfirmed
        ? "p-credits"
        : "collection";

  return (
    <div className="min-h-full bg-zinc-100 px-2.5 py-2.5 dark:bg-zinc-950 sm:px-6 sm:py-5 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <TcgApp
          userId={userId}
          isAdmin={session.user.role === "admin"}
          initialTab={initialTab}
          initialCards={cards}
          initialPackCredits={packCredits}
          initialPCredits={pCredits}
          initialStandardPackPrice={storeConfig.standardPackPrice}
          initialStandardPackSalePrice={storeConfig.standardPackSalePrice ?? null}
          initialPCreditBundles={storeConfig.pCreditBundles}
          initialCustomPacks={customPacks}
          initialListings={listings}
          initialClashOpponent={clashOpponent}
          initialClashStats={clashStats}
          initialLeaderboard={leaderboard}
          hasEarlyAccess={hasEarlyAccess}
          checkoutConfirmed={checkoutConfirmed}
        />
      </div>
    </div>
  );
}
