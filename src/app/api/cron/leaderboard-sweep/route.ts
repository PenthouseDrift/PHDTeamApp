import { NextResponse } from "next/server";
import { reconcileAll } from "@/tcg/leaderboard";

export const maxDuration = 60;

/**
 * Checks every member's line on the Drift Clash Hall of Fame against their cards and fixes any that are out. The board keeps
 * itself right as people play, so this is only a safety net for anything that changed a member's cards without saying so.
 * Safe to run as often as you like. Authenticated with CRON_SECRET like the other /api/cron/* routes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const waiting = await reconcileAll({ budgetMs: 50_000, enqueue: true });
    return NextResponse.json({ waiting });
  } catch (error) {
    console.error("[cron/leaderboard-sweep] failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
