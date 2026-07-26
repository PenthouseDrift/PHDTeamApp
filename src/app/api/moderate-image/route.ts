import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moderateImage } from "@/lib/moderation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, context } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const result = await moderateImage(
    imageUrl,
    context || "General Image Upload",
    {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    }
  );

  return NextResponse.json(result);
}
