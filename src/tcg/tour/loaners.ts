import type { MemberCard } from "@/lib/card-roll";
import { STARTER_LOANER_CREW_CARDS } from "@/tcg/progression";

/**
 * Loaner cards fill empty Loadout slots so a new member can still play a Tour. They are weaker than anything
 * a member pulls, and belong to nobody (userId "loaner").
 */

const loanerCar = (n: number, name: string, chassis: string, parts: string, stats: [number, number, number, number]): MemberCard => ({
  id: `tour-loaner-car-${n}`,
  userId: "loaner",
  name,
  ability: chassis,
  effect: parts,
  driver: "Track Loaner",
  team: "PHD Academy",
  tier: "bronze",
  styleIds: [],
  stats: { drift: String(stats[0]), accel: String(stats[1]), grip: String(stats[2]), steer: String(stats[3]) },
  imageUrl: "/icons/icon-512.png",
  imageZoom: 106,
  imageX: 50,
  imageY: 50,
  kept: true,
  rerolled: false,
  createdAt: 0,
});

export const TOUR_LOANER_CARS: MemberCard[] = [
  loanerCar(1, "PHD Rental RDX #01", "Reve D RDX", "Hobbywing 10BL120 · Yokomo V4 Gyro", [15, 13, 15, 15]),
  loanerCar(2, "PHD Rental YD-2S #02", "Yokomo YD-2S", "Surpass Rocket 10.5T · Futaba S-C400", [14, 14, 14, 15]),
  loanerCar(3, "PHD Rental Galm #03", "Overdose GALM", "Acuvance Agile · Sanwa PGS-CL II", [15, 14, 13, 15]),
];

export const TOUR_LOANER_CREW: MemberCard[] = [...STARTER_LOANER_CREW_CARDS];

export const isLoaner = (card: Pick<MemberCard, "userId">) => card.userId === "loaner";
