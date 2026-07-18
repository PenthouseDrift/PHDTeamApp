export interface GearValidationResult {
  valid: boolean;
  errors: string[];
}

export function computeGearRatio(spur: number, pinion: number): number {
  return Math.round((spur / pinion) * 100) / 100;
}

export function validateGearInput(spur: number, pinion: number): GearValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(spur) || spur < 30 || spur > 130) {
    errors.push("Spur gear must be an integer between 30 and 130");
  }

  if (!Number.isInteger(pinion) || pinion < 10 || pinion > 60) {
    errors.push("Pinion gear must be an integer between 10 and 60");
  }

  return { valid: errors.length === 0, errors };
}
