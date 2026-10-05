export interface Member {
  id: string;
  email: string;
  name: string;
  nickname?: string | null;
  image: string | null;
  role: "admin" | "moderator" | "member";
  qrCode: string | null;
  aiGenerations?: number;
  createdAt: number;
  /** Total number of track check-ins recorded for this member. */
  checkinCount?: number;
  /** Timestamp (ms) of the member's most recent check-in. */
  lastCheckIn?: number;
  discounts?: {
    membership: number;
    daypass: number;
    rental: number;
  };
}

export interface Membership {
  userId: string;
  status: "active" | "expired";
  purchasedAt: number;
  expiresAt: number;
  paymentRef: string;
}

export interface Wallet {
  userId: string;
  dayPasses: number;
  rentalHours: number;
  updatedAt: number;
}

export interface RentalSession {
  rentalId: string;
  userId: string;
  memberName: string;
  scannedAt: number;
  graceEndsAt: number;
  timerStartedAt: number | null;
  sessionEndsAt: number | null;
  status: "grace" | "active" | "completed";
}

export interface CheckIn {
  userId: string;
  adminId: string;
  timestamp: number;
  method: "qr" | "manual" | "day_pass" | "rental";
  memberName: string;
}

export interface CarProfile {
  carId: string;
  userId: string;
  name: string;
  chassis?: string;
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
  frontDamping?: number;
  rearDamping?: number;
  frontRebound?: number;
  rearRebound?: number;
  frontOilWeight: string;
  rearOilWeight: string;
  frontOilBrand: string;
  rearOilBrand: string;
  frontPistonHoles: number;
  rearPistonHoles: number;
  frontPistonHoleSize: string;
  rearPistonHoleSize: string;
  frontShockLength: number;
  rearShockLength: number;
  frontShockBrand: string;
  rearShockBrand: string;
  frontORings: string;
  rearORings: string;
  frontDroop: number;
  rearDroop: number;
  // Drivetrain & Electronics
  motorTurns: number;
  motorTiming: number;
  motorPlacement: string;
  spurGear?: number;
  pinionGear?: number;
  finalDriveRatio?: number;
  gyroGain: number;
  throttleEPA?: number;
  steeringEPA?: number;
  throttleExpo: number;
  steeringExpo: number;
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

export interface MarketplaceListing {
  listingId: string;
  /** Google providerAccountId of the member who posted the listing. */
  userId: string;
  title: string;
  description: string;
  /** Price in GBP. Stored/displayed as a plain number; 0 means "free" / offers. */
  price: number;
  images: string[];
  /** Optional free-text location/pickup note (e.g. "collect at the track"). */
  location: string;
  /**
   * Seller-provided public contact details for this listing. These are chosen
   * per listing by the seller (NOT their private account email), so they
   * control exactly what appears on the public website.
   */
  contactName: string;
  contactMethod: "email" | "phone" | "facebook" | "instagram" | "other";
  contactValue: string;
  /**
   * Seller flag: the item is physically at the Penthouse Drift track and can be
   * bought in person there.
   */
  atTrack: boolean;
  /**
   * Seller flag: buyers should just meet the seller at the track to arrange the
   * sale (no email/phone/social needed). When true, contactValue may be empty.
   */
  meetAtTrack: boolean;
  status: "available" | "sold";
  /**
   * Whether the listing is allowed to appear on the public marketing website.
   * Member listings default to true; admins can hide a listing by setting this
   * to false (mirrors GalleryImage.showOnWebsite curation).
   */
  showOnWebsite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GalleryImage {
  id: string;
  imageUrl: string;
  caption: string;
  showOnWebsite: boolean;
  uploadedBy: string;
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
