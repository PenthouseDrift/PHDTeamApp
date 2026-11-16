"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";
import { requireStaff } from "@/lib/staff-auth";
import type { ActionResult } from "@/types";
import {
  CLUB_ACCOUNTS,
  EMPTY_BALANCES,
  MAX_NOTE_LENGTH,
  accountLabel,
  entryDirection,
  isClubAccount,
  buildClubChartData,
  isValidDay,
  parseClubEntry,
  poundsToPence,
  todayInLondon,
  type ClubAccountId,
  type ClubChartData,
  type ClubLedger,
  type ClubLedgerEntry,
} from "@/lib/club-accounts";

/**
 * Club accounts ledger (SumUp bank, cash, kitty). Admin only.
 *
 * Redis layout:
 *   club:ledger:data       hash   entry id -> the entry (JSON)
 *   club:ledger:idx        zset   entry id, scored by the day it happened (then the time it was recorded)
 *   club:accounts:balances hash   account id -> balance in pence
 * Entries and balances are always changed together in one transaction, so a balance can't disagree with its entries.
 */
const DATA_KEY = "club:ledger:data";
const INDEX_KEY = "club:ledger:idx";
const BALANCES_KEY = "club:accounts:balances";
const PAGE_PATH = "/admin/activity/revenue";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

async function requireAdmin() {
  const staff = await requireStaff();
  return staff && staff.role === "admin" ? staff : null;
}

/** Newest day first, and within a day the one recorded last. Days are far enough apart that the time can't spill over. */
function scoreFor(day: string, createdAt: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + (createdAt % 86_400_000);
}

function cleanNote(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH) : "";
}

/** A day that is a real date and not wildly off (not before 2020, not more than a year ahead). */
function checkDay(day: unknown): string | null {
  if (!isValidDay(day)) return null;
  const [y] = day.split("-").map(Number);
  const maxYear = Number(todayInLondon().slice(0, 4)) + 1;
  return y >= 2020 && y <= maxYear ? day : null;
}

/** The balances and the latest entries. Returns an empty ledger for anyone who isn't an admin. */
export async function getClubLedger(limit: number = DEFAULT_LIMIT): Promise<ClubLedger> {
  const empty: ClubLedger = { balances: { ...EMPTY_BALANCES }, entries: [], totalEntries: 0 };
  try {
    if (!(await requireAdmin())) return empty;
    const take = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit) || DEFAULT_LIMIT));

    const [rawBalances, ids, total] = await Promise.all([
      redis.hgetall(BALANCES_KEY) as Promise<Record<string, unknown> | null>,
      redis.zrange(INDEX_KEY, 0, take - 1, { rev: true }) as Promise<string[]>,
      redis.zcard(INDEX_KEY),
    ]);

    const balances = { ...EMPTY_BALANCES };
    for (const account of CLUB_ACCOUNTS) balances[account.id] = Math.round(Number(rawBalances?.[account.id]) || 0);

    let entries: ClubLedgerEntry[] = [];
    if (ids && ids.length > 0) {
      const rows = (await redis.hmget(DATA_KEY, ...(ids as [string, ...string[]]))) as Record<string, unknown> | null;
      entries = ids.map((id) => parseClubEntry(rows?.[id])).filter((e): e is ClubLedgerEntry => e !== null);
    }
    return { balances, entries, totalEntries: Number(total) || 0 };
  } catch (error) {
    console.error("[club-accounts] getClubLedger failed:", error);
    return empty;
  }
}

/**
 * Money in and out per day and per month, for the chart. It adds up every entry (not just the latest page the list shows),
 * so it reads them all in one go: fine for a club's books, which stay small. Null for anyone who isn't an admin.
 */
export async function getClubChartData(): Promise<ClubChartData | null> {
  try {
    if (!(await requireAdmin())) return null;
    const rows = (await redis.hgetall(DATA_KEY)) as Record<string, unknown> | null;
    const entries = Object.values(rows ?? {})
      .map((raw) => parseClubEntry(raw))
      .filter((e): e is ClubLedgerEntry => e !== null);
    return buildClubChartData(entries, todayInLondon());
  } catch (error) {
    console.error("[club-accounts] getClubChartData failed:", error);
    return null;
  }
}

/** Money in to, or out of, one account. */
export async function addClubEntry(input: {
  account: ClubAccountId;
  direction: "in" | "out";
  amount: number | string;
  date: string;
  note: string;
}): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    if (!staff) return { success: false, error: "Unauthorized" };
    if (!isClubAccount(input.account)) return { success: false, error: "Pick an account", field: "account" };
    if (input.direction !== "in" && input.direction !== "out") return { success: false, error: "Choose money in or money out", field: "direction" };
    const amountPence = poundsToPence(input.amount);
    if (amountPence === null) return { success: false, error: "Enter an amount between 1p and £1,000,000", field: "amount" };
    const date = checkDay(input.date);
    if (!date) return { success: false, error: "Enter a valid date", field: "date" };
    const note = cleanNote(input.note);
    if (!note) return { success: false, error: "Add a short note saying what it was for", field: "note" };

    const now = Date.now();
    const entry: ClubLedgerEntry = {
      id: randomUUID(),
      account: input.account,
      kind: input.direction,
      amountPence,
      date,
      note,
      createdAt: now,
      createdById: staff.id,
      createdByName: staff.name ?? "Admin",
    };
    await redis
      .multi()
      .hset(DATA_KEY, { [entry.id]: JSON.stringify(entry) })
      .zadd(INDEX_KEY, { score: scoreFor(date, now), member: entry.id })
      .hincrby(BALANCES_KEY, entry.account, entryDirection(entry.kind) * amountPence)
      .exec();

    revalidatePath(PAGE_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("[club-accounts] addClubEntry failed:", error);
    return { success: false, error: "Could not save the entry. Please try again." };
  }
}

/** Move money from one account to another: two linked entries, so the total stays the same. */
export async function addClubTransfer(input: {
  from: ClubAccountId;
  to: ClubAccountId;
  amount: number | string;
  date: string;
  note: string;
}): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    if (!staff) return { success: false, error: "Unauthorized" };
    if (!isClubAccount(input.from) || !isClubAccount(input.to)) return { success: false, error: "Pick both accounts" };
    if (input.from === input.to) return { success: false, error: "Choose two different accounts", field: "to" };
    const amountPence = poundsToPence(input.amount);
    if (amountPence === null) return { success: false, error: "Enter an amount between 1p and £1,000,000", field: "amount" };
    const date = checkDay(input.date);
    if (!date) return { success: false, error: "Enter a valid date", field: "date" };
    const note = cleanNote(input.note);

    const now = Date.now();
    const outId = randomUUID();
    const inId = randomUUID();
    const base = { amountPence, date, createdAt: now, createdById: staff.id, createdByName: staff.name ?? "Admin" };
    const outEntry: ClubLedgerEntry = {
      ...base,
      id: outId,
      account: input.from,
      kind: "transfer_out",
      note: note || `Moved to ${accountLabel(input.to)}`,
      pairId: inId,
    };
    const inEntry: ClubLedgerEntry = {
      ...base,
      id: inId,
      account: input.to,
      kind: "transfer_in",
      note: note || `Moved from ${accountLabel(input.from)}`,
      pairId: outId,
    };
    await redis
      .multi()
      .hset(DATA_KEY, { [outId]: JSON.stringify(outEntry), [inId]: JSON.stringify(inEntry) })
      .zadd(INDEX_KEY, { score: scoreFor(date, now), member: outId }, { score: scoreFor(date, now) + 1, member: inId })
      .hincrby(BALANCES_KEY, outEntry.account, -amountPence)
      .hincrby(BALANCES_KEY, inEntry.account, amountPence)
      .exec();

    revalidatePath(PAGE_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("[club-accounts] addClubTransfer failed:", error);
    return { success: false, error: "Could not save the transfer. Please try again." };
  }
}

/** Delete an entry and undo its effect on the balance. Deleting one half of a transfer removes both halves. */
export async function deleteClubEntry(id: string): Promise<ActionResult<null>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Unauthorized" };
    if (typeof id !== "string" || !id) return { success: false, error: "Entry not found" };

    const entry = parseClubEntry(await redis.hget(DATA_KEY, id));
    if (!entry) return { success: false, error: "Entry not found" };
    const pair = entry.pairId ? parseClubEntry(await redis.hget(DATA_KEY, entry.pairId)) : null;

    const tx = redis.multi();
    for (const e of pair ? [entry, pair] : [entry]) {
      tx.hdel(DATA_KEY, e.id).zrem(INDEX_KEY, e.id).hincrby(BALANCES_KEY, e.account, -entryDirection(e.kind) * e.amountPence);
    }
    await tx.exec();

    revalidatePath(PAGE_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("[club-accounts] deleteClubEntry failed:", error);
    return { success: false, error: "Could not delete the entry. Please try again." };
  }
}
