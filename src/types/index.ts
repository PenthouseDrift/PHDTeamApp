export interface Member {
  id: string;
  email: string;
  name: string;
  nickname?: string | null;
  image: string | null;
  role: "admin" | "moderator" | "member" | "asbo-rc";
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
   * Draft flag: the listing has been stocked but NOT yet published. Draft
   * listings are kept OUT of the public browse index (marketplace:all), so they
   * never appear in the in-app marketplace, the website feed, or the public API.
   * Only admins and ASBO-RC users can create drafts and publish them. On
   * publish, isDraft is cleared and the listing enters the public index.
   */
  isDraft: boolean;
  /**
   * Whether the listing is allowed to appear on the public marketing website.
   * Member listings default to true; admins can hide a listing by setting this
   * to false (mirrors GalleryImage.showOnWebsite curation).
   */
  showOnWebsite: boolean;
  /**
   * Total units of this item in the listing. Defaults to 1 for classic
   * single-item listings.
   */
  quantity: number;
  /**
   * How many units have been sold so far (0..quantity). Remaining stock is
   * quantity - soldCount. When none remain the listing status auto-flips to
   * "sold".
   */
  soldCount: number;
  /**
   * Timestamps (ms) for each sold unit, in the order they were marked sold.
   * Length tracks soldCount: incrementing appends Date.now(), decrementing pops
   * the most recent. Lets the ASBO-RC settlement report group sales by date.
   */
  soldAt: number[];
  /**
   * Consignment flag: this item is stock provided by the ASBO-RC partner and
   * sold on their behalf at Penthouse Drift. Only admins and ASBO-RC users can
   * set this. ASBO-RC listings appear in the ASBO-RC Reports.
   */
  soldByAsboRc: boolean;
  /**
   * Display-only flag: show a "Sold by PHD" badge on the advert (first-party
   * items Penthouse Drift sells itself). Purely cosmetic — it has NO effect on
   * the ASBO-RC consignment report/ledger. The "Sold by PHD" badge is shown
   * whenever this OR soldByAsboRc is true. Admin/ASBO-RC only.
   */
  soldByPhd: boolean;
  /**
   * Penthouse Drift's commission percentage on an ASBO-RC consignment sale.
   * Stored per-listing so historical reports stay accurate if the rate ever
   * changes. Defaults to 7 (%). Ignored for non-ASBO-RC listings.
   */
  penthouseCutPct: number;
  /**
   * Legacy whole-listing settlement flag. Superseded by asboRcPaidUnits, but
   * retained so older records are read correctly (a true value is treated as
   * "all sold units paid"). Only meaningful when soldByAsboRc is true.
   */
  asboRcPaid: boolean;
  /**
   * How many of the sold units have been settled (paid to ASBO-RC). This lets
   * each individual sale be marked paid independently: a listing with 2 units
   * sold and 1 paid has asboRcPaidUnits = 1. Clamped to 0..soldCount.
   */
  asboRcPaidUnits: number;
  /** Timestamp (ms) of the most recent settlement action (if any). */
  asboRcPaidAt?: number;
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
