import { randomUUID } from "crypto";
import type { StoredMemberCard } from "@/lib/card-roll";
import type { FullArtCardData } from "@/lib/full-art-card";
import { bonusPullCard } from "@/lib/pack-config";
import { slotOverrides } from "@/lib/pack-draw";

/**
 * The member's copy of a bonus pull, built from the set card that was pulled. Shared by the Standard Pack and custom
 * packs so the bonus card is given out the same way everywhere:
 *  - the picture, name, car details and frame come from the set card as saved, and are never drawn again;
 *  - it is given out as a Legend card with stats lifted into 23 to 25 (see `bonusPullCard`);
 *  - it is marked `featured` and `bonus`, which keeps it out of the community pool and stops its shared picture being
 *    deleted along with a member's card.
 * It is not saved here; the caller writes it to Redis.
 */
export function buildBonusCard(input: {
  source: FullArtCardData & { id: string };
  userId: string;
  ownerName: string;
  createdAt: number;
  /** Set when it came from a custom pack. */
  pack?: { id: string; name: string };
}): StoredMemberCard {
  const { source, userId, ownerName, createdAt, pack } = input;
  const given = bonusPullCard(source);
  return {
    id: randomUUID(),
    userId,
    createdAt,
    name: source.name,
    ability: source.ability,
    effect: source.effect,
    imageUrl: source.imageUrl,
    imageZoom: source.imageZoom,
    imageX: source.imageX,
    imageY: source.imageY,
    driver: source.driver,
    team: source.team,
    styleIds: [],
    // The set card's own frame (colours, effect) comes across, then the bonus rarity and stats go over the top.
    ...slotOverrides({ style: null, fixed: source }),
    tier: given.tier,
    stats: given.stats,
    kept: true,
    rerolled: false,
    ownerName,
    referenceUrl: "",
    bonus: true,
    featured: true,
    bonusFromCardId: source.id,
    ...(pack ? { packId: pack.id, packName: pack.name } : {}),
  };
}
