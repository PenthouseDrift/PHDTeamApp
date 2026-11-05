/**
 * The maths behind tilt control (the tilt sets the drift angle). Pure code, so it can be checked without a phone.
 *
 * A phone reports two tilt angles: `beta` (tipping toward or away from you) and `gamma` (left or right). How they map to
 * "turning a steering wheel" depends on how the phone is held. In portrait, tilting left or right is `gamma`. In landscape
 * (held like a wheel) the wheel turn shows up in `beta`. `screenAngle` is how far the screen has been turned from upright.
 */

/** The angle that counts as a full turn of the wheel, in degrees. */
export const FULL_LOCK_DEGREES = 28;
/** Small movements around "straight" are ignored, in degrees. */
export const DEAD_ZONE_DEGREES = 1.5;

const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Which tilt angle is the steering, in degrees (positive = turn right), for the way the screen is turned. */
export function rollFromOrientation(beta: number | null, gamma: number | null, screenAngle: number): number | null {
  if (beta === null || gamma === null) return null;
  switch (norm360(screenAngle)) {
    case 90:
      return beta;
    case 270:
      return -beta;
    case 180:
      return -gamma;
    default:
      return gamma;
  }
}

/**
 * Steering from -1 to 1. `neutral` is the roll that counts as straight (set when the driver presses "Set straight"),
 * `sensitivity` above 1 makes it quicker to reach full lock, and `flip` reverses left and right.
 */
export function steeringFromRoll(roll: number, neutral: number, sensitivity: number, flip: boolean): number {
  let d = roll - neutral;
  // The angle wraps at 180 degrees on some phones.
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const dz = DEAD_ZONE_DEGREES;
  const mag = Math.max(0, Math.abs(d) - dz);
  const full = FULL_LOCK_DEGREES / Math.max(0.3, sensitivity);
  const u = Math.max(-1, Math.min(1, (Math.sign(d) * mag) / (full - dz)));
  return flip ? -u : u;
}

/** Steering from a finger or mouse across a surface: the middle is straight, a third of the width either way is full lock. */
export function steeringFromPointer(x: number, left: number, width: number): number {
  const centre = left + width / 2;
  return Math.max(-1, Math.min(1, (x - centre) / (width * 0.33)));
}

/**
 * The keyboard sets the drift angle by nudging it: hold an arrow to lean further that way, release to hold the angle where it
 * is. Holding the other arrow brings it back, so flicking across between bends takes about a second.
 */
export const KEYBOARD_RATE = 1.8;
export function nudgeKeyboard(value: number, direction: number, dtSeconds: number): number {
  const step = KEYBOARD_RATE * Math.max(0, Math.min(0.1, dtSeconds));
  return Math.max(-1, Math.min(1, value + direction * step));
}
