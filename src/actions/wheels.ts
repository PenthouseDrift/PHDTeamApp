"use server";

import { redis } from "@/lib/redis";

export interface WheelProduct {
  id: number;
  title: string;
  handle: string;
  imageUrl: string;
  price: string;
  available: boolean;
  link: string;
}

const ASBO_WHEELS_URL = "https://www.asborc.com/collections/rc-drift-wheels/products.json?limit=250";
const REDIS_KEY = "phd:asborc:wheels";
const CACHE_TTL = 3600; // 1 hour

export async function getAsboRCWheels(): Promise<WheelProduct[]> {
  try {
    // 1. Check cache first
    const cached = await redis.get(REDIS_KEY);
    if (cached) {
      return typeof cached === "string" ? JSON.parse(cached) : (cached as WheelProduct[]);
    }

    // 2. Fetch from Shopify
    const response = await fetch(ASBO_WHEELS_URL, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("Failed to fetch wheels from AsboRC:", response.statusText);
      return [];
    }

    const data = await response.json();
    const products: any[] = data.products || [];

    // 3. Transform data
    const wheels: WheelProduct[] = products
      .filter((p) => p.images && p.images.length > 0)
      .map((p) => {
        const variant = p.variants?.[0] || {};
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          imageUrl: p.images[0].src,
          price: variant.price || "0.00",
          available: variant.available !== false,
          link: `https://www.asborc.com/products/${p.handle}`,
        };
      });

    // 4. Cache and return
    await redis.setex(REDIS_KEY, CACHE_TTL, JSON.stringify(wheels));
    return wheels;

  } catch (error) {
    console.error("Error fetching AsboRC wheels:", error);
    return [];
  }
}
