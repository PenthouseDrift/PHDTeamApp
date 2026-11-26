import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isDriftClashHost } from "@/lib/app-host";
import { getCardCredits } from "@/lib/card-credits";
import { listMyCards } from "@/actions/member-cards";
import { redis } from "@/lib/redis";
import { getComingSoonCards } from "@/lib/coming-soon-store";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import {
  getDriftClashLeaderboard,
  getPlayerClashStats,
  hasClashEarlyAccess,
} from "@/tcg/clash";
import {
  getFeaturedShowcaseCards,
  getPCredits,
  getTcgStoreConfig,
  listActiveMarketListings,
  listLiveCustomPacks,
  withoutOdds,
} from "@/tcg/storage";
import { TcgApp } from "@/tcg/components/TcgApp";
import { standardPackAllowsCardCredits } from "@/lib/pack-config-store";
import { listTandemClashChallengesAction } from "@/tcg/challenges-actions";
import { getUnseenReceived } from "@/tcg/trade-store";
import { loadBattlePassView } from "@/tcg/battle-pass/store";
import { markLeaderboardDirty, syncSnapshotFromCards } from "@/tcg/leaderboard";
import type { TcgTab } from "@/tcg/types";

export const dynamic = "force-dynamic";
// A newly opened card can be re-rolled from the large view, which draws new art and can take a while.
export const maxDuration = 60;

interface CardsPageProps {
  searchParams: Promise<{ tab?: string; checkout_id?: string }>;
}

const VALID_TABS: TcgTab[] = [
  "home",
  "play",
  "clash",
  "campaign",
  "collection",
  "store",
  "marketplace",
  "p-credits",
  "battle-pass",
  "leaderboard",
];

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const userId = session.user.id;
  const params = await searchParams;
  // On the game-only Drift Clash host the page has no track app around it, so the game trims duplicated chrome.
  const requestHeaders = await headers();
  const gameOnly = isDriftClashHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));

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
    clashStats,
    leaderboard,
    hasEarlyAccess,
    challengeData,
    rareCards,
    comingSoon,
    standardAllowsCardCredits,
    unseenReceived,
    battlePass,
  ] = await Promise.all([
    listMyCards(),
    getCardCredits(userId),
    getPCredits(userId),
    getTcgStoreConfig(),
    listLiveCustomPacks(),
    listActiveMarketListings(),
    getPlayerClashStats(userId),
    getDriftClashLeaderboard(25, userId),
    hasClashEarlyAccess(userId, session.user.role),
    listTandemClashChallengesAction(),
    getFeaturedShowcaseCards(12),
    getComingSoonCards(),
    standardPackAllowsCardCredits(),
    getUnseenReceived(userId),
    loadBattlePassView(userId),
  ]);
  const isAdmin = session.user.role === "admin";

  // Keep this member's line on the Hall of Fame right, for free: their cards are already in hand, so one small read compares them
  // with what the board holds, and a write happens only if something changed. (A collection too big to list in full is added up
  // by the board itself instead.) This is what repairs the board for anyone who plays, whatever changed their cards.
  try {
    if (cards.length >= 500) await markLeaderboardDirty(userId);
    else await syncSnapshotFromCards(userId, cards);
  } catch (error) {
    console.error("[cards] could not update the Hall of Fame summary:", error);
  }

  // ?tab=clash opens Tandem Clash itself. The Play page (?tab=play) lists it with the other game modes.
  const requestedTab = params.tab as TcgTab | undefined;
  const initialTab: TcgTab =
    requestedTab && VALID_TABS.includes(requestedTab)
      ? requestedTab
      : checkoutConfirmed
        ? "p-credits"
        : "home";

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
          initialStandardAllowsCardCredits={standardAllowsCardCredits}
          initialStandardPackEnabled={storeConfig.standardPackEnabled !== false}
          initialPCreditBundles={storeConfig.pCreditBundles}
          initialCustomPacks={customPacks.map(withoutOdds)}
          initialListings={listings}
          initialClashStats={clashStats}
          initialLeaderboard={leaderboard}
          hasEarlyAccess={hasEarlyAccess}
          initialChallenges={challengeData.success ? challengeData.data.challenges : []}
          initialCompletedChallengeIds={challengeData.success ? challengeData.data.completedIds : []}
          initialRareCards={rareCards}
          initialComingSoon={comingSoon}
          checkoutConfirmed={checkoutConfirmed}
          gameOnly={gameOnly}
          initialReceived={unseenReceived}
          battlePassOpen={battlePass.enabled || isAdmin}
          initialBattlePass={battlePass}
        />
      </div>
    </div>
  );
}
