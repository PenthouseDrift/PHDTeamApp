import { NextResponse } from "next/server";
import { sendDailyEventReminders } from "@/actions/notifications";

export const runtime = "nodejs";

export async function GET() {
  const result = await sendDailyEventReminders();
  return NextResponse.json({ success: true, ...result });
}

export async function POST() {
  const result = await sendDailyEventReminders();
  return NextResponse.json({ success: true, ...result });
}
