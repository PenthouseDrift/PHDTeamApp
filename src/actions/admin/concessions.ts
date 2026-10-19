"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { randomUUID } from "crypto";
import {
  computeMetrics,
  money,
  count,
  normalizeCategory,
  round2,
  type ConcessionItem,
  type ConcessionRow,
  type ConcessionOverview,
  type ConcessionInput,
} from "@/lib/concessions";

// Units-per-case must be at least 1 so cost/unit division is always valid.
function unitsPerCase(raw: unknown): number {
  return Math.max(1, count(raw));
}

const LIST_KEY = "admin:concessions:list";
const itemKey = (id: string) => `concession:${id}`;

function parseItem(raw: Record<string, unknown> | null | undefined): ConcessionItem | null {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    name: (raw.name as string) || "Unnamed",
    category: normalizeCategory(raw.category),
    caseCost: money(raw.caseCost),
    unitsPerCase: unitsPerCase(raw.unitsPerCase),
    sellPrice: money(raw.sellPrice),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user && session.user.role === "admin");
}

/** Load all concession items with derived metrics + an overview total. */
export async function getConcessions(): Promise<ConcessionOverview> {
  const empty: ConcessionOverview = {
    items: [],
    totals: { itemCount: 0, totalCaseCost: 0, totalCaseProfit: 0, marginPct: 0 },
  };

  try {
    if (!(await isAdmin())) return empty;

    const ids = await redis.lrange(LIST_KEY, 0, -1);
    if (!ids || ids.length === 0) return empty;

    const pipeline = redis.pipeline();
    ids.forEach((id) => pipeline.hgetall(itemKey(id)));
    const results = await pipeline.exec();

    const items: ConcessionRow[] = (results || [])
      .map((r) => parseItem(r as Record<string, unknown> | null))
      .filter((item): item is ConcessionItem => item !== null)
      .map((item) => ({ ...item, metrics: computeMetrics(item) }));

    // Highest unit profit first — the most useful ordering for an overview.
    items.sort((a, b) => b.metrics.profitPerUnit - a.metrics.profitPerUnit);

    const totals = items.reduce(
      (acc, i) => {
        acc.totalCaseCost = round2(acc.totalCaseCost + i.caseCost);
        acc.totalCaseProfit = round2(acc.totalCaseProfit + i.metrics.caseProfit);
        return acc;
      },
      { itemCount: items.length, totalCaseCost: 0, totalCaseProfit: 0, marginPct: 0 }
    );
    // Blended margin across one case of every item (profit ÷ revenue).
    const totalCaseRevenue = round2(totals.totalCaseCost + totals.totalCaseProfit);
    totals.marginPct = totalCaseRevenue > 0 ? round2((totals.totalCaseProfit / totalCaseRevenue) * 100) : 0;

    return { items, totals };
  } catch (error) {
    console.error("getConcessions error:", error);
    return empty;
  }
}

export async function createConcession(input: ConcessionInput): Promise<ActionResult<ConcessionItem>> {
  try {
    if (!(await isAdmin())) return { success: false, error: "Unauthorized" };

    const name = (input.name || "").trim().slice(0, 120);
    if (!name) return { success: false, error: "Name is required", field: "name" };

    const id = randomUUID();
    const now = Date.now();
    const item: ConcessionItem = {
      id,
      name,
      category: normalizeCategory(input.category),
      caseCost: money(input.caseCost),
      unitsPerCase: unitsPerCase(input.unitsPerCase),
      sellPrice: money(input.sellPrice),
      createdAt: now,
      updatedAt: now,
    };

    await redis.multi().hset(itemKey(id), { ...item }).rpush(LIST_KEY, id).exec();
    revalidatePath("/admin/activity/revenue/concessions");
    return { success: true, data: item };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to add item" };
  }
}

export async function updateConcession(
  id: string,
  input: ConcessionInput
): Promise<ActionResult<ConcessionItem>> {
  try {
    if (!(await isAdmin())) return { success: false, error: "Unauthorized" };

    const existing = parseItem((await redis.hgetall(itemKey(id))) as Record<string, unknown> | null);
    if (!existing) return { success: false, error: "Item not found" };

    const name = (input.name || "").trim().slice(0, 120);
    if (!name) return { success: false, error: "Name is required", field: "name" };

    const updated: ConcessionItem = {
      ...existing,
      name,
      category: normalizeCategory(input.category),
      caseCost: money(input.caseCost),
      unitsPerCase: unitsPerCase(input.unitsPerCase),
      sellPrice: money(input.sellPrice),
      updatedAt: Date.now(),
    };

    await redis.hset(itemKey(id), { ...updated });
    revalidatePath("/admin/activity/revenue/concessions");
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update item" };
  }
}

export async function deleteConcession(id: string): Promise<ActionResult<null>> {
  try {
    if (!(await isAdmin())) return { success: false, error: "Unauthorized" };

    await redis.multi().del(itemKey(id)).lrem(LIST_KEY, 0, id).exec();
    revalidatePath("/admin/activity/revenue/concessions");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete item" };
  }
}
