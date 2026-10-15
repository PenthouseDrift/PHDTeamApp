import { z } from "zod";

export const carProfileSchema = z.object({
  name: z.string().min(1).max(50),
  chassis: z.string().max(100).optional().default(""),
  images: z.array(z.string().url()).min(0).max(10).default([]),
});

export const calibrationSchema = z.object({
  name: z.string().min(1).max(50),
  // Steering
  frontCamber: z.number().min(-15).max(0).optional().default(0),
  rearCamber: z.number().min(-15).max(0).optional().default(0),
  frontToe: z.number().min(-5).max(5).optional().default(0),
  rearToe: z.number().min(-5).max(5).optional().default(0),
  frontCaster: z.number().min(0).max(30).optional().default(0),
  ackermann: z.number().min(-100).max(100).optional().default(0),
  steeringAngle: z.number().min(0).max(90).optional().default(0),
  // Suspension
  frontRideHeight: z.number().min(0).max(50).optional().default(0),
  rearRideHeight: z.number().min(0).max(50).optional().default(0),
  frontSpringRate: z.string().max(50).optional().default(""),
  rearSpringRate: z.string().max(50).optional().default(""),
  frontOilWeight: z.string().max(50).optional().default(""),
  rearOilWeight: z.string().max(50).optional().default(""),
  frontOilBrand: z.string().max(50).optional().default(""),
  rearOilBrand: z.string().max(50).optional().default(""),
  frontPistonHoles: z.number().int().min(0).max(20).optional().default(0),
  rearPistonHoles: z.number().int().min(0).max(20).optional().default(0),
  frontPistonHoleSize: z.string().max(50).optional().default(""),
  rearPistonHoleSize: z.string().max(50).optional().default(""),
  frontShockLength: z.number().min(0).max(200).optional().default(0),
  rearShockLength: z.number().min(0).max(200).optional().default(0),
  frontShockBrand: z.string().max(50).optional().default(""),
  rearShockBrand: z.string().max(50).optional().default(""),
  frontORings: z.string().max(50).optional().default(""),
  rearORings: z.string().max(50).optional().default(""),
  frontDroop: z.number().min(0).max(50).optional().default(0),
  rearDroop: z.number().min(0).max(50).optional().default(0),
  // Drivetrain & Electronics
  motorTurns: z.number().min(0).max(30).optional().default(0),
  motorTiming: z.number().int().min(0).max(60).optional().default(0),
  motorPlacement: z.string().max(50).optional().default(""),
  spurGear: z.number().int().min(0).max(200).optional().default(0),
  pinionGear: z.number().int().min(0).max(100).optional().default(0),
  finalDriveRatio: z.number().min(0).max(50).optional().default(0),
  gyroGain: z.number().int().min(0).max(100).optional().default(0),
  throttleExpo: z.number().int().min(-100).max(100).optional().default(0),
  steeringExpo: z.number().int().min(-100).max(100).optional().default(0),
  boost: z.number().int().min(0).max(100).optional().default(0),
  turbo: z.number().int().min(0).max(100).optional().default(0),
  // Geometry
  frontTrackWidth: z.number().min(0).max(250).optional().default(0),
  rearTrackWidth: z.number().min(0).max(250).optional().default(0),
  wheelbase: z.number().min(0).max(300).optional().default(0),
  // Weight
  batteryPosition: z.string().max(50).optional().default(""),
  totalWeight: z.number().min(0).max(5000).optional().default(0),
  // Tyres
  frontTyres: z.string().max(50).optional().default(""),
  rearTyres: z.string().max(50).optional().default(""),
  // Custom
  customParams: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        value: z.string().min(1).max(30),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

export const shellSubmissionSchema = z.object({
  imageUrl: z.string().url(),
  description: z.string().max(500).optional().default(""),
});

export const marketplaceListingSchema = z
  .object({
    title: z.string().min(2).max(80),
    description: z.string().max(1000).optional().default(""),
    price: z.number().min(0).max(100000),
    // ASBO-RC consignment base (the 7% split is calculated on this). Optional:
    // unset falls back to `price`. Enforced in the action/superRefine.
    consignmentPrice: z.number().min(0).max(100000).optional(),
    images: z.array(z.string().url()).min(1).max(6),
    location: z.string().max(80).optional().default(""),
    contactName: z.string().max(60).optional().default(""),
    contactMethod: z
      .enum(["email", "phone", "facebook", "instagram", "other"])
      .optional()
      .default("other"),
    // Optional at the schema level; required-unless-meetAtTrack is enforced below.
    contactValue: z.string().max(120).optional().default(""),
    atTrack: z.boolean().optional().default(false),
    meetAtTrack: z.boolean().optional().default(false),
    // Available units. Defaults to 1 (classic single-item listing).
    quantity: z.number().int().min(1).max(10000).optional().default(1),
    // ASBO-RC consignment flag (admins / ASBO-RC users only; enforced in the action).
    soldByAsboRc: z.boolean().optional().default(false),
    // Display-only "Sold by PHD" badge (admins / ASBO-RC users only; enforced in the action).
    soldByPhd: z.boolean().optional().default(false),
    // Draft / "stock first, publish later" flag (admins / ASBO-RC users only;
    // enforced in the action). Draft listings stay out of the public index.
    isDraft: z.boolean().optional().default(false),
    // Variants: when hasVariations is true, `variants` must have >=1 entry and
    // variationLabel must be non-empty (enforced in superRefine below). Each
    // variant carries its own price + stock.
    hasVariations: z.boolean().optional().default(false),
    variationLabel: z.string().max(40).optional().default(""),
    variants: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1).max(60),
          price: z.number().min(0).max(100000),
          // Per-variant ASBO consignment base; unset falls back to the variant price.
          consignmentPrice: z.number().min(0).max(100000).optional(),
          quantity: z.number().int().min(0).max(10000),
          soldCount: z.number().int().min(0).max(10000).optional().default(0),
        })
      )
      .max(50)
      .optional()
      .default([]),
    // Penthouse Drift commission % on ASBO-RC sales. Default 7%.
    penthouseCutPct: z.number().min(0).max(100).optional().default(7),
  })
  .superRefine((data, ctx) => {
    // A contact detail is required unless the seller opts to meet at the track,
    // OR the item is Sold by PHD / ASBO-RC consignment (bought in person at the
    // track — no seller contact needed).
    const boughtAtTrack = data.soldByPhd || data.soldByAsboRc;
    if (!boughtAtTrack && !data.meetAtTrack && !data.contactValue.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactValue"],
        message: "Add contact details, or tick 'Meet at the track'.",
      });
    }

    // ASBO consignment pricing: the sell price must be >= the consignment base
    // (the normal path never sells below what we owe ASBO). Only checked when a
    // consignment price is explicitly set.
    if (data.soldByAsboRc) {
      if (
        !data.hasVariations &&
        data.consignmentPrice != null &&
        data.consignmentPrice > data.price
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["consignmentPrice"],
          message: "Consignment price can't be higher than the sell price.",
        });
      }
      if (data.hasVariations && data.variants) {
        data.variants.forEach((v, i) => {
          if (v.consignmentPrice != null && v.consignmentPrice > v.price) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["variants", i, "consignmentPrice"],
              message: "Consignment price can't be higher than the sell price.",
            });
          }
        });
      }
    }

    // When variations are enabled, require a label and at least one variant;
    // variant names must be unique (they're the user-facing option values).
    if (data.hasVariations) {
      if (!data.variationLabel.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variationLabel"],
          message: "Add a label for your variations (e.g. 'Colour').",
        });
      }
      if (!data.variants || data.variants.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants"],
          message: "Add at least one variation, or turn variations off.",
        });
      } else {
        const seen = new Set<string>();
        data.variants.forEach((v, i) => {
          const key = v.name.trim().toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["variants", i, "name"],
              message: `Duplicate variation "${v.name}".`,
            });
          }
          seen.add(key);
          if (v.soldCount != null && v.soldCount > v.quantity) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["variants", i, "soldCount"],
              message: "Sold count can't exceed quantity.",
            });
          }
        });
      }
    }
  });

export const gearRatioSchema = z.object({
  spur: z.number().int().min(30).max(130),
  pinion: z.number().int().min(10).max(60),
});

export const facebookPostSchema = z.object({
  message: z.string().min(1).max(63206),
  imageUrls: z
    .array(z.string().url())
    .max(4)
    .optional()
    .default([]),
});
