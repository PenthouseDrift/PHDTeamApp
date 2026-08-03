"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { randomUUID } from "crypto";

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  stock: number;
  isActive: boolean;
  createdAt: string;
}

export async function getProducts(activeOnly = true): Promise<ShopProduct[]> {
  try {
    const productIds = await redis.lrange("shop:products:list", 0, -1);
    if (!productIds || productIds.length === 0) return [];

    const pipeline = redis.pipeline();
    productIds.forEach((id) => pipeline.hgetall(`product:${id}`));
    const results = await pipeline.exec();

    const products = results
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description || "",
        price: Number(p.price) || 0,
        imageUrl: p.imageUrl || undefined,
        stock: Number(p.stock) || 0,
        isActive: p.isActive === "true",
        createdAt: p.createdAt,
      }))
      .filter((p) => (activeOnly ? p.isActive : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return products;
  } catch (error) {
    console.error("Failed to get products:", error);
    return [];
  }
}

export async function createProduct(data: Omit<ShopProduct, "id" | "createdAt">): Promise<ActionResult<ShopProduct>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const id = randomUUID();
    const product: ShopProduct = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
    };

    await redis
      .multi()
      .hset(`product:${id}`, {
        ...product,
        isActive: String(product.isActive),
      })
      .lpush("shop:products:list", id)
      .exec();

    revalidatePath("/shop");
    revalidatePath("/admin/shop");

    return { success: true, data: product };
  } catch (error) {
    console.error("Failed to create product:", error);
    return { success: false, error: "Failed to create product" };
  }
}

export async function updateProduct(id: string, data: Partial<ShopProduct>): Promise<ActionResult<ShopProduct>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const existing = await redis.hgetall(`product:${id}`);
    if (!existing) {
      return { success: false, error: "Product not found" };
    }

    const updated = {
      ...existing,
      ...data,
      isActive: data.isActive !== undefined ? String(data.isActive) : existing.isActive,
    };

    await redis.hset(`product:${id}`, updated);

    revalidatePath("/shop");
    revalidatePath("/admin/shop");

    return { success: true, data: updated as unknown as ShopProduct };
  } catch (error) {
    console.error("Failed to update product:", error);
    return { success: false, error: "Failed to update product" };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult<void>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    await redis
      .multi()
      .del(`product:${id}`)
      .lrem("shop:products:list", 0, id)
      .exec();

    revalidatePath("/shop");
    revalidatePath("/admin/shop");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete product:", error);
    return { success: false, error: "Failed to delete product" };
  }
}
