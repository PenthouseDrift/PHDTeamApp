import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAdminCustomPrompts } from "@/actions/admin/custom-prompts";
import { listFullArtCards } from "@/actions/admin/full-art-cards";
import { getStandardPackConfig } from "@/actions/admin/driftclash-packs";
import { listPackStyles } from "@/actions/admin/pack-styles";
import { listComingSoonItems } from "@/actions/admin/coming-soon";
import { DriftClashPacksAdmin } from "@/components/admin/driftclash/DriftClashPacksAdmin";
import { getTcgStoreConfig, listCustomPacks } from "@/tcg/storage";

export const dynamic = "force-dynamic";
// Drawing a style preview with AI runs under this route and can take a while.
export const maxDuration = 60;

export default async function DriftClashPacksPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const [standardConfig, styles, packs, savedPrompts, fullArtCards, storeConfig, comingSoon] = await Promise.all([
    getStandardPackConfig(),
    listPackStyles(),
    listCustomPacks({ onlyLive: false }),
    listAdminCustomPrompts(),
    listFullArtCards(300),
    getTcgStoreConfig(),
    listComingSoonItems(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link
          data-page-back
          href="/admin/driftclash"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to DriftClash
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Card packs</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          See what each pack can pull on every rarity. Add custom styles and set cards to a rarity and give each its own chance;
          whatever is left over is the normal generated card. Click any card to see its prompt. The Coming soon tab sets the teaser row on the game&apos;s Home page.
        </p>
      </div>
      <DriftClashPacksAdmin
        initialStandardConfig={standardConfig}
        initialStyles={styles}
        initialPacks={packs}
        initialComingSoon={comingSoon}
        savedPrompts={savedPrompts}
        fullArtCards={fullArtCards}
        standardPackPrice={storeConfig.standardPackPrice}
        standardPackSalePrice={storeConfig.standardPackSalePrice ?? null}
        pCreditBundles={storeConfig.pCreditBundles}
      />
    </div>
  );
}
