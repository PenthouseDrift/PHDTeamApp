import { randomUUID } from "crypto";
import type { StoredMemberCard } from "@/lib/card-roll";
import { crewDefinitionToCardData, rollCrewCardDefinition } from "@/lib/crew-cards";
import { rollMaintenanceConsumableCard } from "@/lib/mechanical-faults";
import { packExtraCounts, type PackConfig } from "@/lib/pack-config";
import { getClashGameCardsConfig } from "@/tcg/storage";

/**
 * The Crew Modifier and Repair Kit cards a custom pack gives on top of its normal cards, as many of each as the pack is set
 * to (see `crewCards` and `repairCards` in pack-config.ts). They are rolled exactly like the ones in a Standard Pack: a crew
 * card from the Crew Advantage set (including any admin-made ones), and a repair kit of a random fault and rarity.
 * Nothing is saved here. The caller writes the cards, which is why a failed roll just gives fewer cards.
 */
export async function buildPackExtraCards(input: {
  config: PackConfig;
  userId: string;
  ownerName: string;
  /** The first card gets this time, and each after it one more millisecond, so they sort in the order given. */
  createdAt: number;
  rng: () => number;
  pack: { id: string; name: string };
}): Promise<StoredMemberCard[]> {
  const { config, userId, ownerName, rng, pack } = input;
  const { crew, repair } = packExtraCounts(config);
  if (crew === 0 && repair === 0) return [];

  const out: StoredMemberCard[] = [];
  let at = input.createdAt;
  const base = {
    userId,
    styleIds: [] as string[],
    kept: true,
    rerolled: false,
    ownerName,
    referenceUrl: "",
    bonus: true as const,
    packId: pack.id,
    packName: pack.name,
  };

  if (crew > 0) {
    const clashConfig = await getClashGameCardsConfig().catch(() => null);
    for (let i = 0; i < crew; i++) {
      try {
        const def = rollCrewCardDefinition(rng, clashConfig?.crewCards);
        out.push({ id: randomUUID(), createdAt: at++, ...crewDefinitionToCardData(def), ...base, bonusFromCardId: def.id });
      } catch (error) {
        console.error("[pack-extras] could not roll a crew card:", error);
      }
    }
  }
  for (let i = 0; i < repair; i++) {
    try {
      out.push({ id: randomUUID(), createdAt: at++, ...rollMaintenanceConsumableCard(rng), ...base });
    } catch (error) {
      console.error("[pack-extras] could not roll a repair kit:", error);
    }
  }
  return out;
}
