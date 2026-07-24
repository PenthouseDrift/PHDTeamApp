import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { redeemDayPass, redeemRentalHour } from "@/actions/wallet";
import { createRentalSession } from "@/actions/admin/rentals";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    let rawInput: string = (body.memberId || "").toString().trim();
    let memberId: string = rawInput;
    let scanType: "membership" | "day_pass" | "rental" = "membership";
    let nonce: string | undefined = undefined;

    // Handle JSON formatted QR payloads
    if (typeof rawInput === "string" && rawInput.startsWith("{")) {
      try {
        const parsed = JSON.parse(rawInput);
        if (parsed.memberId) {
          memberId = parsed.memberId.toString().trim();
          scanType = parsed.type || "membership";
          nonce = parsed.nonce;
        }
      } catch {
        /* use raw text */
      }
    }

    if (!memberId) {
      return NextResponse.json({ error: "Please enter a valid member ID, name, or email" }, { status: 400 });
    }

    // Look up member by direct ID or search by email, name, or nickname
    let targetUserId = memberId;
    let memberData = await redis.hgetall(`member:${targetUserId}`);

    if (!memberData || Object.keys(memberData).length === 0) {
      let cursor = 0;
      const queryLower = targetUserId.toLowerCase();
      let matchedId: string | null = null;

      do {
        const [newCursor, keys] = await redis.scan(cursor, {
          match: "member:*",
          count: 200,
        });
        cursor = Number(newCursor);

        for (const key of keys) {
          const keyStr = key as string;
          if (keyStr.split(":").length > 2) continue;
          const uId = keyStr.replace("member:", "");
          const mData = await redis.hgetall(keyStr);
          if (!mData || !mData.email) continue;

          const email = (mData.email as string).toLowerCase();
          const name = (mData.name as string).toLowerCase();
          const nick = (mData.nickname as string)?.toLowerCase() || "";

          if (
            uId.toLowerCase() === queryLower ||
            email === queryLower ||
            name === queryLower ||
            nick === queryLower ||
            email.includes(queryLower) ||
            name.includes(queryLower) ||
            (nick && nick.includes(queryLower))
          ) {
            matchedId = uId;
            memberData = mData;
            break;
          }
        }
        if (matchedId) break;
      } while (cursor !== 0);

      if (matchedId) {
        targetUserId = matchedId;
      }
    }

    if (!memberData || Object.keys(memberData).length === 0) {
      return NextResponse.json({
        status: "invalid",
        message: `No member found for "${memberId}"`,
      });
    }

    memberId = targetUserId;

    const memberName = (memberData.name as string) || "Member";
    const nickname = (memberData.nickname as string) || "";
    const formattedAdminName = nickname.trim()
      ? `${memberName} ("${nickname.trim()}")`
      : memberName;

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Fetch membership and wallet data
    const [membershipData, walletData] = await Promise.all([
      redis.hgetall(`membership:${memberId}`),
      redis.hgetall(`wallet:${memberId}`),
    ]);

    const isMembershipActive =
      membershipData && Number(membershipData.expiresAt) > now;
    const dayPasses = Math.max(0, Number(walletData?.dayPasses) || 0);
    const rentalHours = Math.max(0, Number(walletData?.rentalHours) || 0);

    const memberDetails = {
      id: memberId,
      name: formattedAdminName,
      image: (memberData.customAvatar as string) || (memberData.image as string) || null,
      membershipStatus: isMembershipActive ? ("active" as const) : ("expired" as const),
      dayPasses,
      rentalHours,
    };

    // Single-use enforcement for Day Pass & Rental QR codes
    if ((scanType === "day_pass" || scanType === "rental") && nonce) {
      const isUsed = await redis.get(`qr:used_nonce:${nonce}`);
      if (isUsed) {
        return NextResponse.json({
          status: "invalid",
          member: memberDetails,
          message: `${formattedAdminName} — This ${scanType === "day_pass" ? "Day Pass" : "Car Rental"} QR code has already been used!`,
        });
      }
    }

    // Handle Rental QR Scan
    if (scanType === "rental") {
      const redeemRes = await redeemRentalHour(memberId);
      if (!redeemRes.success) {
        return NextResponse.json({
          status: "expired",
          member: memberDetails,
          message: `${formattedAdminName} — No Car Rental Hours left in wallet`,
        });
      }

      // Mark single-use nonce as used
      if (nonce) {
        await redis.set(`qr:used_nonce:${nonce}`, "1", { ex: 86400 * 30 });
        await redis.del(`qr:nonce:rental:${memberId}`);
      }

      await createRentalSession(memberId, formattedAdminName);

      const entry = JSON.stringify({
        userId: memberId,
        adminId: session.user.id,
        timestamp: now,
        method: "rental",
        memberName: formattedAdminName,
      });

      await redis.rpush(`checkins:${today}`, entry);

      return NextResponse.json({
        status: "active",
        member: { ...memberDetails, rentalHours: redeemRes.data.remaining },
        message: `${formattedAdminName} — Car Rental Started! (${redeemRes.data.remaining} hrs remaining)`,
      });
    }

    // Handle Day Pass QR Scan
    if (scanType === "day_pass") {
      const redeemRes = await redeemDayPass(memberId);
      if (!redeemRes.success) {
        return NextResponse.json({
          status: "expired",
          member: memberDetails,
          message: `${formattedAdminName} — No Day Passes left in wallet`,
        });
      }

      // Mark single-use nonce as used
      if (nonce) {
        await redis.set(`qr:used_nonce:${nonce}`, "1", { ex: 86400 * 30 });
        await redis.del(`qr:nonce:day_pass:${memberId}`);
      }

      const entry = JSON.stringify({
        userId: memberId,
        adminId: session.user.id,
        timestamp: now,
        method: "day_pass",
        memberName: formattedAdminName,
      });

      await redis.rpush(`checkins:${today}`, entry);

      return NextResponse.json({
        status: "active",
        member: { ...memberDetails, dayPasses: redeemRes.data.remaining },
        message: `${formattedAdminName} — Day Pass Redeemed! (${redeemRes.data.remaining} passes remaining)`,
      });
    }

    // Default Membership QR Check
    if (!isMembershipActive && !body.override) {
      return NextResponse.json({
        status: "expired",
        member: memberDetails,
        message: `${formattedAdminName} — Membership Expired`,
      });
    }

    // Check dedup (1-hour window or already checked in today)
    const dedupKey = `checkin:dedup:${memberId}`;
    const alreadyCheckedIn = await redis.get(dedupKey);
    if (alreadyCheckedIn) {
      return NextResponse.json({
        status: "duplicate",
        member: memberDetails,
        message: `${formattedAdminName} — Already checked in today!`,
      });
    }

    // Record check-in
    const entry = JSON.stringify({
      userId: memberId,
      adminId: session.user.id,
      timestamp: now,
      method: "qr",
      memberName: formattedAdminName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(dedupKey, "1", { ex: 3600 });

    return NextResponse.json({
      status: "active",
      member: memberDetails,
      message: `${formattedAdminName} — Active 28-Day Membership - Allowed on Track`,
    });
  } catch (error) {
    console.error("Check-in scan error:", error);
    return NextResponse.json(
      { error: "Check-in failed", status: "error" },
      { status: 500 }
    );
  }
}
