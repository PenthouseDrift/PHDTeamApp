import { redis } from "@/lib/redis";

export const CURRENCY = "GBP";

/** Base prices in GBP. Single source of truth for all purchase flows. */
export const BASE_PRICES = {
  membership: 40.0,
  daypass: 10.0,
  rental: 10.0,
} as const;

export const MEMBERSHIP_DURATION_DAYS = 28;

export type DiscountItem = "membership" | "daypass" | "rental";

/** Redis hash fields on `member:<id>` that store the per-user discount amount (in GBP). */
const DISCOUNT_FIELDS: Record<DiscountItem, string> = {
  membership: "discountMembership",
  daypass: "discountDayPass",
  rental: "discountRental",
};

export interface MemberDiscounts {
  membership: number;
  daypass: number;
  rental: number;
}

export const EMPTY_DISCOUNTS: MemberDiscounts = {
  membership: 0,
  daypass: 0,
  rental: 0,
};

/** Clamp a raw discount value to a valid, non-negative amount no larger than the base price. */
export function normalizeDiscount(item: DiscountItem, raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(rounded, BASE_PRICES[item]);
}

/** Parse discount fields out of a raw `member:<id>` hash. */
export function parseDiscounts(memberHash: Record<string, unknown> | null | undefined): MemberDiscounts {
  if (!memberHash) return { ...EMPTY_DISCOUNTS };
  return {
    membership: normalizeDiscount("membership", memberHash[DISCOUNT_FIELDS.membership]),
    daypass: normalizeDiscount("daypass", memberHash[DISCOUNT_FIELDS.daypass]),
    rental: normalizeDiscount("rental", memberHash[DISCOUNT_FIELDS.rental]),
  };
}

/** Read a member's discounts directly from Redis. */
export async function getMemberDiscounts(userId: string): Promise<MemberDiscounts> {
  const hash = (await redis.hgetall(`member:${userId}`)) as Record<string, unknown> | null;
  return parseDiscounts(hash);
}

/** Persist a member's discounts, storing 0 as an empty field. */
export async function setMemberDiscounts(userId: string, discounts: MemberDiscounts): Promise<void> {
  await redis.hset(`member:${userId}`, {
    [DISCOUNT_FIELDS.membership]: normalizeDiscount("membership", discounts.membership),
    [DISCOUNT_FIELDS.daypass]: normalizeDiscount("daypass", discounts.daypass),
    [DISCOUNT_FIELDS.rental]: normalizeDiscount("rental", discounts.rental),
  });
}

export interface PriceBreakdown {
  /** Full price before any discount. */
  original: number;
  /** Per-unit discount amount applied. */
  discount: number;
  /** Effective per-unit price after discount (never below 0). */
  final: number;
  /** True when a discount is applied. */
  hasDiscount: boolean;
}

/** Compute the per-unit price breakdown for an item given a per-unit discount. */
export function priceFor(item: DiscountItem, perUnitDiscount: number): PriceBreakdown {
  const original = BASE_PRICES[item];
  const discount = normalizeDiscount(item, perUnitDiscount);
  const final = Math.max(0, Math.round((original - discount) * 100) / 100);
  return { original, discount, final, hasDiscount: discount > 0 };
}

/** Format a GBP amount for display, e.g. 40 -> "£40.00". */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
