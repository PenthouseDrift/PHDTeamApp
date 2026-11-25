"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { isBlobUrl } from "@/lib/card-art-generate";
import { getRegistrationById, listRegistrations, REGISTRATION_KEY } from "@/lib/driftclash-registrations";
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

// ── Registrations as a source for set cards ─────────────────────────────────

/** One car (one "form" in the registration) with only the pictures that can be used on a card. */
export interface RegistrationCardCar {
  id: string;
  /** "Make Model", with the nickname after it when there is one. */
  label: string;
  make: string;
  model: string;
  nickname: string;
  chassis: string;
  motor: string;
  esc: string;
  gyro: string;
  servo: string;
  notes: string;
  photos: string[];
  chassisPhotos: string[];
}

/** A registration trimmed to what the card tab needs. No email, no Google details. */
export interface RegistrationCardSource {
  id: string;
  driverName: string;
  nickname: string;
  guest: boolean;
  createdAt: number;
  /** They agreed to their details and photos being used in the game. */
  consentGameData: boolean;
  club: { name: string; logo: string; photos: string[] } | null;
  cars: RegistrationCardCar[];
}

/** The most registrations sent to the tab at once. Newest first. */
const MAX_SOURCES = 500;

/** Keep only pictures that live in our own file store: those are the only ones a card can be made from. */
function usablePhotos(urls: unknown): string[] {
  return (Array.isArray(urls) ? urls : []).filter((u): u is string => isBlobUrl(u));
}

/**
 * The registrations an admin can make a card from: who they are, their cars and the pictures they uploaded. Registrations with
 * no usable picture are left out. Admin only.
 */
export async function listRegistrationCardSourcesAction(): Promise<ActionResult<RegistrationCardSource[]>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") return { success: false, error: "Only admins can use registrations" };

    const all = (await listRegistrations()).slice(0, MAX_SOURCES);
    const out: RegistrationCardSource[] = [];
    for (const r of all) {
      const cars: RegistrationCardCar[] = (r.cars ?? [])
        .map((car) => ({
          id: String(car.id),
          label: `${car.make} ${car.model}`.trim() + (car.nickname ? ` · ${car.nickname}` : ""),
          make: car.make ?? "",
          model: car.model ?? "",
          nickname: car.nickname ?? "",
          chassis: car.chassis ?? "",
          motor: car.motor ?? "",
          esc: car.esc ?? "",
          gyro: car.gyro ?? "",
          servo: car.servo ?? "",
          notes: car.notes ?? "",
          photos: usablePhotos(car.photos),
          chassisPhotos: usablePhotos(car.chassisPhotos),
        }))
        .filter((car) => car.photos.length + car.chassisPhotos.length > 0);

      const clubLogo = isBlobUrl(r.club?.logo) ? r.club.logo : "";
      const clubPhotos = usablePhotos(r.club?.photos);
      const club = r.club?.inClub && (clubLogo || clubPhotos.length > 0) ? { name: r.club.name ?? "", logo: clubLogo, photos: clubPhotos } : null;

      if (cars.length === 0 && !club) continue;
      out.push({
        id: r.id,
        driverName: r.driver?.driverName ?? "",
        nickname: r.driver?.nickname ?? "",
        guest: r.source === "guest",
        createdAt: r.createdAt,
        consentGameData: r.consentGameData === true,
        club,
        cars,
      });
    }
    return { success: true, data: out };
  } catch (error) {
    console.error("[driftclash-registrations] listing card sources failed:", error);
    return { success: false, error: "Could not load the registrations" };
  }
}
