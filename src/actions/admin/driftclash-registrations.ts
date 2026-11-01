"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getRegistrationById, REGISTRATION_KEY } from "@/lib/driftclash-registrations";
import type { ActionResult } from "@/types";

/** Mark a DriftClash registration as looked at (or put it back to new). */
export async function setRegistrationReviewedAction(id: string, reviewed: boolean): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") return { success: false, error: "Only admins can change this" };

    const record = await getRegistrationById(id);
    if (!record) return { success: false, error: "That registration no longer exists" };

    const next = { ...record, status: reviewed ? ("reviewed" as const) : ("new" as const) };
    if (reviewed) next.reviewedAt = Date.now();
    else delete next.reviewedAt;

    await redis.set(REGISTRATION_KEY(id), next);
    revalidatePath("/admin/driftclash/registrations");
    revalidatePath(`/admin/driftclash/registrations/${id}`);
    revalidatePath("/admin/driftclash");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update that registration" };
  }
}
