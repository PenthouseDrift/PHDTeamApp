import { z } from "zod";

export const carProfileSchema = z.object({
  name: z.string().min(1).max(50),
  images: z.array(z.string().url()).min(1).max(10),
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
