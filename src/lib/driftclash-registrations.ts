import { redis } from "@/lib/redis";

/**
 * People who registered on the DriftClash website (the driftClash app, not this one). That site writes
 * them to the shared Redis; this file only reads them. The shape matches driftClash/src/lib/registration.ts,
 * so change the two together. A registration's id is the person's Google account id.
 */

export const REGISTRATION_KEY = (id: string) => `driftclash:registration:${id}`;
export const REGISTRATION_INDEX = "driftclash:registrations";

export interface RegistrationCar {
  id: string;
  nickname: string;
  make: string;
  model: string;
  chassis: string;
  bodyShell: string;
  motor: string;
  esc: string;
  servo: string;
  gyro: string;
  tyres: string;
  notes: string;
  photos: string[];
  /** Added later, so records saved before it have none. */
  chassisPhotos?: string[];
}

export interface DriftClashRegistration {
  id: string;
  email: string;
  googleName: string;
  googleImage: string;
  /** "guest" when they registered without signing in (their id is then "guest-<uuid>" and the Google fields are blank). Older records have none. */
  source?: "google" | "guest";
  driver: {
    driverName: string;
    nickname: string;
  };
  club: {
    country: string;
    inClub: boolean;
    name: string;
    location: string;
    role: string;
    description: string;
    logo: string;
    photos: string[];
  };
  cars: RegistrationCar[];
  consentGameData: boolean;
  consentMarketing: boolean;
  status: "new" | "reviewed";
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
}

/** Edited since an admin last marked it reviewed. */
export function hasUpdatesSinceReview(r: DriftClashRegistration): boolean {
  return r.status === "reviewed" && r.reviewedAt !== undefined && r.updatedAt > r.reviewedAt;
}

/** Everyone who has registered, newest sign up first. */
export async function listRegistrations(): Promise<DriftClashRegistration[]> {
  const ids = (await redis.zrange<string[]>(REGISTRATION_INDEX, 0, -1, { rev: true })) ?? [];
  if (ids.length === 0) return [];
  const records = await redis.mget<Array<DriftClashRegistration | null>>(...ids.map(REGISTRATION_KEY));
  return records.filter((r): r is DriftClashRegistration => r !== null && r !== undefined);
}

export async function getRegistrationById(id: string): Promise<DriftClashRegistration | null> {
  const record = await redis.get<DriftClashRegistration>(REGISTRATION_KEY(id));
  return record ?? null;
}

/** How many are waiting for a first look. */
export async function countNewRegistrations(): Promise<number> {
  const all = await listRegistrations();
  return all.filter((r) => r.status === "new").length;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Stop spreadsheets from running a cell that starts like a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** One row per car (or one row for a person with none), so the sheet can be filtered by car. */
export function registrationsToCsv(registrations: DriftClashRegistration[]): string {
  const header = [
    "Signed up",
    "Status",
    "Email",
    "Driver name",
    "Nickname",
    "Country",
    "In a club",
    "Club name",
    "Club location",
    "Club role",
    "Club logo",
    "Car #",
    "Car nickname",
    "Make",
    "Model",
    "Chassis",
    "Body shell",
    "Motor",
    "ESC",
    "Servo",
    "Gyro",
    "Tyres",
    "Car notes",
    "Car photos",
    "Chassis photos",
    "OK to use in game",
    "OK to email",
  ];
  const rows = registrations.flatMap((r) => {
    const base = [
      new Date(r.createdAt).toISOString(),
      r.status,
      r.email,
      r.driver.driverName,
      r.driver.nickname,
      r.club.country,
      r.club.inClub ? "yes" : "no",
      r.club.name,
      r.club.location,
      r.club.role,
      r.club.logo,
    ];
    const tail = [r.consentGameData ? "yes" : "no", r.consentMarketing ? "yes" : "no"];
    const cars = r.cars.length > 0 ? r.cars : [null];
    return cars.map((c, i) => [
      ...base,
      c ? i + 1 : "",
      c?.nickname ?? "",
      c?.make ?? "",
      c?.model ?? "",
      c?.chassis ?? "",
      c?.bodyShell ?? "",
      c?.motor ?? "",
      c?.esc ?? "",
      c?.servo ?? "",
      c?.gyro ?? "",
      c?.tyres ?? "",
      c?.notes ?? "",
      c?.photos.join(" ") ?? "",
      c?.chassisPhotos?.join(" ") ?? "",
      ...tail,
    ]);
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
