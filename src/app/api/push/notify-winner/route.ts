import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { sendToAllAdmins } from "@/lib/push";

export async function GET(request: Request) {
  // Can be triggered by external cron (cron-job.org) or manually
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if winner already selected this week
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.ceil((now.getTime() - jan1.getTime()) / 86400000);
    const week = Math.ceil((dayOfYear + jan1.getDay()) / 7);
    const year = now.getFullYear();

    const winnerKey = `shells:winner:${year}:${week}`;
    const currentWinner = await redis.get(winnerKey);

    if (currentWinner) {
      return NextResponse.json({ message: "Winner already selected this week", sent: 0 });
    }

    // Send push notification to all admins
    const sent = await sendToAllAdmins({
      title: "🏆 Showcase Winner Reminder",
      body: "Time to select this week's shell showcase winner!",
      url: "/admin/showcase-winners",
    });

    return NextResponse.json({ message: "Notifications sent", sent });
  } catch (error) {
    console.error("Push notify error:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
