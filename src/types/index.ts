export interface Member {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: "admin" | "member";
  qrCode: string | null;
  createdAt: number;
}

export interface Membership {
  userId: string;
  status: "active" | "expired";
  purchasedAt: number;
  expiresAt: number;
  paymentRef: string;
}

export interface CheckIn {
  userId: string;
  adminId: string;
  timestamp: number;
  method: "qr" | "manual";
  memberName: string;
}

export interface CarProfile {
  carId: string;
  userId: string;
  name: string;
  images: string[];
  createdAt: number;
}

export interface CalibrationSetup {
  calibrationId: string;
  carId: string;
  userId: string;
  name: string;
  // Steering
  frontCamber: number;
  rearCamber: number;
  frontToe: number;
  rearToe: number;
  frontCaster: number;
  ackermann: number;
  steeringAngle: number;
  // Suspension
  frontRideHeight: number;
  rearRideHeight: number;
  frontSpringRate: string;
  rearSpringRate: string;
  frontDamping: number;
  rearDamping: number;
  frontRebound: number;
  rearRebound: number;
  frontDroop: number;
  rearDroop: number;
  // Drivetrain & Electronics
  motorTurns: number;
  motorTiming: number;
  gyroGain: number;
  throttleEPA: number;
  steeringEPA: number;
  boost: number;
  turbo: number;
  // Geometry
  frontTrackWidth: number;
  rearTrackWidth: number;
  wheelbase: number;
  // Weight
  batteryPosition: string;
  totalWeight: number;
  // Tyres
  frontTyres: string;
  rearTyres: string;
  // Custom
  customParams: CustomParam[];
  createdAt: number;
}

export interface CustomParam {
  name: string;
  value: string;
}

export interface ShellEntry {
  shellId: string;
  userId: string;
  imageUrl: string;
  description: string;
  voteCount: number;
  createdAt: number;
}

export interface GearRatio {
  spur: number;
  pinion: number;
  ratio: number;
}

export interface FacebookPost {
  id: string;
  message: string;
  createdTime: string;
  images: string[];
  hasUnsupportedContent: boolean;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; field?: string };
