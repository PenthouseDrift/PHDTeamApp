import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishPost } from "@/lib/facebook";
import { facebookPostSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = facebookPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }

    const { message, imageUrls } = parsed.data;
    const result = await publishPost(
      message,
      imageUrls.length > 0 ? imageUrls : undefined
    );
    return NextResponse.json({ success: true, postId: result.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Publish failed",
      },
      { status: 500 }
    );
  }
}
