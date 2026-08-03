"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { randomUUID } from "crypto";
import { ShopProduct } from "./shop";

export type OrderType = "shop" | "membership" | "day_pass" | "rental";
export type OrderStatus = "pending" | "paid" | "ready_for_collection" | "collected";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface AppOrder {
  id: string;
  userId: string;
  checkoutReference?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  type: OrderType;
  createdAt: string;
  userName?: string; // For admin view
}

export async function createOrder(
  userId: string,
  items: OrderItem[],
  totalAmount: number,
  type: OrderType,
  checkoutReference?: string
): Promise<ActionResult<AppOrder>> {
  try {
    const id = randomUUID();
    const order: AppOrder = {
      id,
      userId,
      items,
      totalAmount,
      status: "pending",
      type,
      checkoutReference,
      createdAt: new Date().toISOString(),
    };

    await redis
      .multi()
      .hset(`order:${id}`, {
        ...order,
        items: JSON.stringify(items),
      })
      .lpush(`user:${userId}:orders`, id)
      .exec();

    return { success: true, data: order };
  } catch (error) {
    console.error("Failed to create order:", error);
    return { success: false, error: "Failed to create order" };
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<ActionResult<AppOrder>> {
  try {
    const existing = await redis.hgetall(`order:${id}`);
    if (!existing) {
      return { success: false, error: "Order not found" };
    }

    const prevStatus = existing.status as OrderStatus;
    await redis.hset(`order:${id}`, { status });

    // Handle queues for shop items
    if (existing.type === "shop") {
      const multi = redis.multi();
      
      // If moving to ready
      if (status === "ready_for_collection" && prevStatus !== "ready_for_collection") {
        multi.lpush("admin:orders:active", id);
      }
      
      // If moving out of ready (e.g. collected)
      if (prevStatus === "ready_for_collection" && status !== "ready_for_collection") {
        multi.lrem("admin:orders:active", 0, id);
      }

      // If just paid (from pending) and it's a shop order, automatically mark ready for collection
      if (prevStatus === "pending" && status === "paid") {
        multi.hset(`order:${id}`, { status: "ready_for_collection" });
        multi.lpush("admin:orders:active", id);
      }
      
      await multi.exec();
    }

    revalidatePath("/admin/orders");
    revalidatePath("/orders");

    return { success: true, data: { ...existing, status } as unknown as AppOrder };
  } catch (error) {
    console.error("Failed to update order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function getUserOrders(userId: string): Promise<AppOrder[]> {
  try {
    const orderIds = await redis.lrange(`user:${userId}:orders`, 0, -1);
    if (!orderIds || orderIds.length === 0) return [];

    const pipeline = redis.pipeline();
    orderIds.forEach((id) => pipeline.hgetall(`order:${id}`));
    const results = await pipeline.exec();

    return results
      .map((o: any) => ({
        ...o,
        totalAmount: Number(o.totalAmount),
        items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error("Failed to get user orders:", error);
    return [];
  }
}

export async function getActiveShopOrders(): Promise<AppOrder[]> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return [];
    }

    const orderIds = await redis.lrange("admin:orders:active", 0, -1);
    if (!orderIds || orderIds.length === 0) return [];

    const pipeline = redis.pipeline();
    orderIds.forEach((id) => pipeline.hgetall(`order:${id}`));
    const results = await pipeline.exec();

    // Fetch user names for admin display
    const userIds = [...new Set(results.map((o: any) => o.userId))];
    const userPipeline = redis.pipeline();
    userIds.forEach(uid => userPipeline.hget(`member:${uid}`, "name"));
    const userNames = await userPipeline.exec();
    const userMap = new Map();
    userIds.forEach((uid, i) => userMap.set(uid, userNames[i]));

    return results
      .map((o: any) => ({
        ...o,
        totalAmount: Number(o.totalAmount),
        items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
        userName: userMap.get(o.userId) || "Unknown User",
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Oldest first
  } catch (error) {
    console.error("Failed to get active orders:", error);
    return [];
  }
}
