import type { MemberCard } from "@/lib/card-roll";
import { rollCarInitialDurability, rollMechanicalFault } from "@/lib/mechanical-faults";
import { memberCardKey, memberCardsIndexKey, parseStoredCard } from "@/lib/member-card-store";
import { redis } from "@/lib/redis";
import type { PitEvent } from "./types";

/**
 * Car wear for campaign battles. The cup is played with the member's own cards, so every battle costs them the same
 * maintenance as a normal Tandem Clash battle (the rules are those of completeClashBattleAction in clash.ts):
 *
 *   - each car that raced loses one battle of durability; at zero it breaks down with a random mechanical fault
 *   - any other car in the garage that is already broken moves one battle closer to being repaired
 *
 * The changed cards are saved to the member's real deck. Crew, Maintenance, Debuff and Track cards are not cars and are
 * left alone.
 */
export async function wearAfterBattle(
  userId: string,
  racedCardIds: string[]
): Promise<{ updated: Map<string, MemberCard>; events: PitEvent[] }> {
  const raced = new Set(racedCardIds);
  const updated = new Map<string, MemberCard>();
  const events: PitEvent[] = [];

  const ids = ((await redis.zrange(memberCardsIndexKey(userId), 0, 999)) as string[]).map(String);
  if (ids.length === 0) return { updated, events };
  const rows = await redis.mget(...ids.map(memberCardKey));

  const toSave = [];
  for (const row of rows) {
    const c = parseStoredCard(row);
    if (!c || c.userId !== userId) continue;
    if (c.cardType === "crew" || c.cardType === "maintenance" || c.cardType === "debuff" || c.cardType === "track") continue;

    if (raced.has(c.id)) {
      const current = typeof c.battlesRemaining === "number" ? c.battlesRemaining : (c.maxBattles ?? rollCarInitialDurability());
      if (current > 1) {
        c.battlesRemaining = current - 1;
      } else {
        c.battlesRemaining = 0;
        const fault = rollMechanicalFault();
        c.fault = fault;
        events.push({
          type: "fault",
          cardId: c.id,
          cardName: c.name,
          faultName: fault.name,
          faultIcon: fault.icon,
          battlesNeeded: fault.battlesNeeded,
        });
      }
      toSave.push(c);
    } else if (c.fault && c.fault.battlesRemaining > 0) {
      const next = c.fault.battlesRemaining - 1;
      if (next <= 0) {
        c.fault = null;
        const fresh = rollCarInitialDurability();
        c.maxBattles = fresh;
        c.battlesRemaining = fresh;
        events.push({ type: "repaired", cardId: c.id, cardName: c.name, freshBattles: fresh });
      } else {
        c.fault.battlesRemaining = next;
      }
      toSave.push(c);
    }
  }

  await Promise.all(toSave.map((c) => redis.set(memberCardKey(c.id), JSON.stringify(c))));
  for (const c of toSave) {
    const { referenceUrl, ...card } = c;
    void referenceUrl;
    updated.set(c.id, card as MemberCard);
  }
  return { updated, events };
}
