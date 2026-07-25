"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { Wallet, ActionResult } from "@/types";

export async function getWallet(userId: string): Promise<ActionResult<Wallet>> {
  try {
    const data = await redis.hgetall(`wallet:${userId}`);
    if (!data || Object.keys(data).length === 0) {
      const defaultWallet: Wallet = {
        userId,
        dayPasses: 0,
        rentalHours: 0,
        updatedAt: Date.now(),
      };
      return { success: true, data: defaultWallet };
    }

    const wallet: Wallet = {
      userId,
      dayPasses: Math.max(0, Number(data.dayPasses) || 0),
      rentalHours: Math.max(0, Number(data.rentalHours) || 0),
      updatedAt: Number(data.updatedAt) || Date.now(),
    };

    return { success: true, data: wallet };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load wallet",
    };
  }
}

export async function addDayPasses(
  userId: string,
  quantity: number
): Promise<ActionResult<Wallet>> {
  try {
    const current = await getWallet(userId);
    const wallet = current.success ? current.data : { userId, dayPasses: 0, rentalHours: 0, updatedAt: Date.now() };

    const newPasses = wallet.dayPasses + quantity;
    const now = Date.now();

    await redis.hset(`wallet:${userId}`, {
      userId,
      dayPasses: newPasses,
      rentalHours: wallet.rentalHours,
      updatedAt: now,
    });

    revalidatePath("/wallet");
    return {
      success: true,
      data: { userId, dayPasses: newPasses, rentalHours: wallet.rentalHours, updatedAt: now },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add Day Passes",
    };
  }
}

export async function addRentalHours(
  userId: string,
  quantity: number
): Promise<ActionResult<Wallet>> {
  try {
    const current = await getWallet(userId);
    const wallet = current.success ? current.data : { userId, dayPasses: 0, rentalHours: 0, updatedAt: Date.now() };

    const newHours = wallet.rentalHours + quantity;
    const now = Date.now();

    await redis.hset(`wallet:${userId}`, {
      userId,
      dayPasses: wallet.dayPasses,
      rentalHours: newHours,
      updatedAt: now,
    });

    revalidatePath("/wallet");
    return {
      success: true,
      data: { userId, dayPasses: wallet.dayPasses, rentalHours: newHours, updatedAt: now },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add Rental Hours",
    };
  }
}

export async function redeemDayPass(userId: string): Promise<ActionResult<{ remaining: number }>> {
  try {
    const current = await getWallet(userId);
    if (!current.success || current.data.dayPasses <= 0) {
      return { success: false, error: "No Day Passes available in wallet" };
    }

    const newPasses = current.data.dayPasses - 1;
    const now = Date.now();

    await redis.hset(`wallet:${userId}`, {
      userId,
      dayPasses: newPasses,
      rentalHours: current.data.rentalHours,
      updatedAt: now,
    });

    revalidatePath("/wallet");
    return { success: true, data: { remaining: newPasses } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to redeem Day Pass",
    };
  }
}

export async function redeemRentalHour(userId: string): Promise<ActionResult<{ remaining: number }>> {
  try {
    const current = await getWallet(userId);
    if (!current.success || current.data.rentalHours <= 0) {
      return { success: false, error: "No Rental Hours available in wallet" };
    }

    const newHours = current.data.rentalHours - 1;
    const now = Date.now();

    await redis.hset(`wallet:${userId}`, {
      userId,
      dayPasses: current.data.dayPasses,
      rentalHours: newHours,
      updatedAt: now,
    });

    revalidatePath("/wallet");
    return { success: true, data: { remaining: newHours } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to redeem Rental Hour",
    };
  }
}

export async function createWalletCheckout(
  userId: string,
  itemType: "daypass" | "rental",
  quantity: number
): Promise<ActionResult<{ url: string }>> {
  try {
    const { createCheckout } = await import("@/lib/sumup");
    const unitPrice = 10.0;
    const totalAmount = quantity * unitPrice;
    const description =
      itemType === "daypass"
        ? `Penthouse Drift - ${quantity}x Day Pass`
        : `Penthouse Drift - ${quantity}x Car Rental Hour`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkout = await createCheckout({
      memberId: `${itemType}_${userId}_${quantity}`,
      amount: totalAmount,
      currency: "GBP",
      description,
      returnUrl: `${baseUrl}/wallet`,
    });

    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: userId,
        itemType,
        quantity,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 86400 * 30 }
    );
    await redis.set(`pending_wallet_checkout:${userId}`, checkout.id, { ex: 86400 });

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    return { success: true, data: { url: redirectUrl } };
  } catch (error) {
    console.error("createWalletCheckout error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize payment checkout",
    };
  }
}
