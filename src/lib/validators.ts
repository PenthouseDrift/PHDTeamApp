import { z } from "zod";

export const carProfileSchema = z.object({
  name: z.string().min(1).max(50),
  images: z.array(z.string().url()).min(1).max(10),
});

export const calibrationSchema = z.object({
  name: z.string().min(1).max(50),
  camber: z.number().min(-15).max(15),
  toe: z.number().min(-10).max(10),
  caster: z.number().min(-15).max(15),
  boost: z.number().int().min(0).max(100),
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
