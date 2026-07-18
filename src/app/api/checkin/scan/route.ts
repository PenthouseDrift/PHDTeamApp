import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "Invalid QR code data" }, { status: 400 });
    }

    // Look up member
    const memberData = await redis.hgetall(`member:${memberId}`);
    if (!memberData || Object.keys(memberData).length === 0) {
      return NextResponse.json({
        status: "invalid",
        message: "This QR code is not associated with any member",
      });
    }

    // Check membership
    const membershipData = await redis.hgetall(`membership:${memberId}`);
    const isActive =
      membershipData && Number(membershipData.expiresAt) > Date.now();

    if (!isActive) {
      return NextResponse.json({
        status: "expired",
        member: { name: memberData.name, image: memberData.image },
        message: "Expired - Renewal Required",
      });
    }

    // Check dedup (1-hour window)
    const dedupKey = `checkin:dedup:${memberId}`;
    const alreadyCheckedIn = await redis.get(dedupKey);
    if (alreadyCheckedIn) {
      return NextResponse.json({
        status: "duplicate",
        member: { name: memberData.name, image: memberData.image },
        message: "Member already checked in within the last hour",
      });
    }

    // Record check-in
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const entry = JSON.stringify({
      userId: memberId,
      adminId: session.user.id,
      timestamp: now,
      method: "qr",
      memberName: memberData.name,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(dedupKey, "1", { ex: 3600 });

    return NextResponse.json({
      status: "active",
      member: { name: memberData.name, image: memberData.image },
      message: "Active - Allowed on Track",
    });
  } catch {
    return NextResponse.json(
      { error: "Check-in failed", status: "error" },
      { status: 500 }
    );
  }
}
