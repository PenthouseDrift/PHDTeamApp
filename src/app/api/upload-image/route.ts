import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ImageUploadError, optimizeUpload } from "@/lib/image-compress";
import { redis } from "@/lib/redis";

/**
 * Every picture a signed-in person uploads comes through here. It is read, turned the right way up, shrunk and saved as a
 * WebP BEFORE anything is stored, so nothing is ever kept at its original size. (The old way sent the file straight to
 * storage from the browser, which meant the app could not check or shrink it.)
 *
 * The file travels in the request, and the hosting limit for a request is 4.5 MB. The browser shrinks big photos before it
 * sends them (see src/lib/upload-client.ts), so a normal photo is well under that.
 */
const MAX_REQUEST_BYTES = 4.4 * 1024 * 1024;
const UPLOADS_PER_HOUR = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // A simple cap per person so the picture shrinker can't be used to run up the bill.
    const key = `upload:count:${userId}`;
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, 3600);
    if (used > UPLOADS_PER_HOUR) {
      return NextResponse.json({ error: "You've uploaded a lot of pictures in the last hour. Please try again later." }, { status: 429 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No picture was sent." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "That picture is empty." }, { status: 400 });
    if (file.size > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "That picture is too large to upload. Try a smaller photo." }, { status: 413 });
    }

    // Avatars ask for a small size; everything else is capped at 2400 pixels and defaults to 1600.
    const requested = Number(form.get("maxWidth"));
    const maxWidth = Number.isFinite(requested) && requested > 0 ? Math.min(2400, Math.max(128, Math.round(requested))) : 1600;

    const { buffer } = await optimizeUpload(Buffer.from(await file.arrayBuffer()), { maxWidth });
    const blob = await put(`uploads/${randomUUID()}.webp`, buffer, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url, bytes: buffer.length });
  } catch (error) {
    if (error instanceof ImageUploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[upload-image] failed:", error);
    return NextResponse.json({ error: "The upload didn't work. Please try again." }, { status: 500 });
  }
}
