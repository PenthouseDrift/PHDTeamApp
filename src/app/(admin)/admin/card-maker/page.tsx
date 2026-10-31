import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listSavedCards } from "@/actions/admin/cards";
import { listFeaturedCards, listFullArtCards } from "@/actions/admin/full-art-cards";
import { CardMakerTabs, type CardMakerTabKind } from "@/components/cards/CardMakerTabs";
import { getClashGameCardsConfig, getTcgStoreConfig, listCustomPacks } from "@/tcg/storage";

export const dynamic = "force-dynamic";
// The AI art server action runs under this route, and image generation can take a while.
export const maxDuration = 60;

interface CardMakerPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function CardMakerPage({ searchParams }: CardMakerPageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const [params, originalSaved, fullArtSaved, featured, storeConfig, customPacks, clashCardsConfig] = await Promise.all([
    searchParams,
    listSavedCards(),
    listFullArtCards(),
    listFeaturedCards(),
    getTcgStoreConfig(),
    listCustomPacks({ onlyLive: false }),
    getClashGameCardsConfig(),
  ]);

  const initialTab: CardMakerTabKind =
    params.tab === "packs"
      ? "packs"
      : params.tab === "clash-cards"
      ? "clash-cards"
      : params.tab === "challenges"
      ? "challenges"
      : params.tab === "original"
      ? "original"
      : "full-art";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link
          data-page-back
          href="/cards"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to DriftClash Hub
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
          Card maker &amp; TCG Pack Store
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Build custom Full-Art PHD trading cards, manage Crew / Debuff / UK Track Clash cards, or configure Set Packs &amp; Standard Pack pricing.
        </p>
      </div>
      <CardMakerTabs
        initialTab={initialTab}
        initialFullArtSaved={fullArtSaved}
        initialOriginalSaved={originalSaved}
        initialFeatured={featured}
        initialStandardPackPrice={storeConfig.standardPackPrice}
        initialStandardPackSalePrice={storeConfig.standardPackSalePrice ?? null}
        initialPCreditBundles={storeConfig.pCreditBundles}
        initialCustomPacks={customPacks}
        initialClashCardsConfig={clashCardsConfig}
      />
    </div>
  );
}
