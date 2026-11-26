"use server";

import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { CURRENCY } from "@/lib/pricing";
import { buildDriftClashReport, EMPTY_SALES, type DriftClashReport } from "@/lib/drift-clash-report";
import { getTcgStoreConfig } from "@/tcg/storage";

/**
 * Admin only. Reads the activity log, and the P-Credit bundles and builds the Drift Clash report
 * (see `buildDriftClashReport` for what is counted).
 */
export async function getDriftClashReport(): Promise<DriftClashReport> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return {
      currency: CURRENCY,
      sales: { ...EMPTY_SALES, averagePurchase: 0 },
      bundles: [],
      months: [],
      firstSale: null,
      lastSale: null,
    };
  }
  const [records, store] = await Promise.all([
    redis.zrange("activity:log", 0, -1, { rev: true }),
    getTcgStoreConfig().catch(() => null),
  ]);
  return buildDriftClashReport({ records: records as unknown[], bundles: store?.pCreditBundles ?? [] }, CURRENCY);
}
