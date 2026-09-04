"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import type { ActionResult, GalleryImage } from "@/types";
import { randomUUID } from "crypto";

const GALLERY_INDEX = "gallery:all";

function toGalleryImage(data: Record<string, unknown> | null): GalleryImage | null {
  if (!data || Object.keys(data).length === 0) return null;
  return {
    id: data.id as string,
    imageUrl: data.imageUrl as string,
    caption: (data.caption as string) || "",
    showOnWebsite: String(data.showOnWebsite) === "true",
    uploadedBy: (data.uploadedBy as string) || "",
    createdAt: Number(data.createdAt) || 0,
  };
}

/**
 * All gallery images (admin view). Newest first.
 */
export async function getGalleryImages(): Promise<GalleryImage[]> {
  try {
    const ids = await redis.lrange(GALLERY_INDEX, 0, -1);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    ids.forEach((id) => pipeline.hgetall(`gallery:${id as string}`));
    const rawResults = await pipeline.exec();

    const images = rawResults
      .map((raw) => toGalleryImage(raw as Record<string, unknown> | null))
      .filter((img): img is GalleryImage => img !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    return images;
  } catch (error) {
    console.error("Failed to get gallery images:", error);
    return [];
  }
}

/**
 * Only images flagged to show on the public website. Newest first.
 * Used by the public aggregate API — no auth guard.
 */
export async function getWebsiteGalleryImages(): Promise<GalleryImage[]> {
  const all = await getGalleryImages();
  return all.filter((img) => img.showOnWebsite);
}

export async function addGalleryImage(data: {
  imageUrl: string;
  caption?: string;
  showOnWebsite?: boolean;
}): Promise<ActionResult<GalleryImage>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    if (!data.imageUrl || typeof data.imageUrl !== "string") {
      return { success: false, error: "An image is required" };
    }

    const id = randomUUID();
    const image: GalleryImage = {
      id,
      imageUrl: data.imageUrl,
      caption: (data.caption || "").slice(0, 200),
      showOnWebsite: data.showOnWebsite ?? true,
      uploadedBy: session.user.id,
      createdAt: Date.now(),
    };

    await redis
      .multi()
      .hset(`gallery:${id}`, {
        ...image,
        showOnWebsite: String(image.showOnWebsite),
      })
      .lpush(GALLERY_INDEX, id)
      .exec();

    revalidatePath("/admin/gallery");
    return { success: true, data: image };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add image",
    };
  }
}

export async function toggleGalleryVisibility(
  id: string
): Promise<ActionResult<{ showOnWebsite: boolean }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const data = await redis.hgetall(`gallery:${id}`);
    if (!data || Object.keys(data).length === 0) {
      return { success: false, error: "Image not found" };
    }

    const next = String(data.showOnWebsite) !== "true";
    await redis.hset(`gallery:${id}`, { showOnWebsite: String(next) });

    revalidatePath("/admin/gallery");
    return { success: true, data: { showOnWebsite: next } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update image",
    };
  }
}

export async function deleteGalleryImage(id: string): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const data = await redis.hgetall(`gallery:${id}`);
    const imageUrl = data?.imageUrl as string | undefined;

    await redis.multi().del(`gallery:${id}`).lrem(GALLERY_INDEX, 0, id).exec();

    // Best-effort blob cleanup; ignore failures so the record still deletes.
    if (imageUrl) {
      try {
        await deleteImage(imageUrl);
      } catch {
        /* ignore blob deletion errors */
      }
    }

    revalidatePath("/admin/gallery");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete image",
    };
  }
}
