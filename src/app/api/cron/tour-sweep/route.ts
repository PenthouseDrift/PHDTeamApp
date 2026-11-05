import { NextResponse } from "next/server";
import { endIdleTours } from "@/tcg/tour/service";

/**
 * Ends Tandem Tours that nobody has touched for 24 hours, paying the prize for the wins reached (the entry price is not
 * refunded). Safe to run as often as you like: ending a Tour twice changes nothing. Authenticated with CRON_SECRET like
 * the other /api/cron/* routes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const ended = await endIdleTours();
    return NextResponse.json({ ended });
  } catch (error) {
    console.error("[cron/tour-sweep] failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
