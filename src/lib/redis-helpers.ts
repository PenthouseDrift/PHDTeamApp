import { redis } from "./redis";
import type { ActionResult } from "@/types";

const WRITE_TIMEOUT_MS = 5000;

export async function redisWrite<T>(
  operation: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis write timeout")),
          WRITE_TIMEOUT_MS
        )
      ),
    ]);
    return { success: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Redis operation failed";
    return { success: false, error: message };
  }
}

export async function redisRead<T>(
  operation: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load data";
    return { success: false, error: message };
  }
}
