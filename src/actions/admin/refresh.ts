"use server";

import { revalidatePath } from "next/cache";

export async function refreshAdminPath(path: string) {
  revalidatePath(path);
  return { success: true, timestamp: Date.now() };
}
