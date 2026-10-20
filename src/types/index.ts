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

/**
 * A single purchasable variant of a listing (e.g. one colour). Each variant
 * carries its own price and stock, so a listing can offer, say, "Colour: Black
 * £3.99 (2 left), Red £3.99 (0 left)". Only used when the listing has
 * `hasVariations` set; otherwise the listing's own price/quantity apply.
 */
export interface ListingVariant {
  /** Stable id for the variant (used as the React key and for stock edits). */
  id: string;
  /** The variant value shown under the listing's variationLabel (e.g. "Black"). */
  name: string;
  /** This variant's price in GBP (the SELL price the customer pays). */
  price: number;
  /**
   * ASBO-RC consignment base price for this variant — the figure the 7% split
   * is calculated on. Any amount of `price` above this is kept entirely by
   * Penthouse (the "uplift"). Optional: when unset (undefined), the consignment
   * base falls back to this variant's `price` (so uplift is £0). Only meaningful
   * for ASBO-RC consignment listings.
   */
  consignmentPrice?: number;
  /** Total units of this variant. */
  quantity: number;
  /** Units of this variant sold so far (0..quantity). */
  soldCount: number;
  /**
   * Admin-only hold on this variant: how many units are reserved for a buyer
   * and therefore not buyable right now (but not sold). Reduces buyable
   * availability by this amount: buyable = quantity - soldCount - reservedCount.
   * Display/purchase-gate only — never affects stock or the ASBO-RC ledger.
   * Defaults to 0. (Legacy boolean `reserved:true` migrates to "all remaining
   * units held".)
   */
  reservedCount?: number;
}

/**
 * Fixed set of marketplace product categories. Single source of truth for the
 * listing form <select>, the browse/filter UIs, and validation. Keep the order
 * stable — it drives how filter chips render.
 */
export const MARKETPLACE_CATEGORIES = [
  "Body shells",
  "Wheels & tyres",
  "Electronics & Lighting",
  "Chassis Parts",
  "Accessories",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export interface MarketplaceListing {
  listingId: string;
  /** Google providerAccountId of the member who posted the listing. */
  userId: string;
  title: string;
  description: string;
  /**
   * Product category (one of MARKETPLACE_CATEGORIES). Required on new/edited
   * listings; legacy records that predate categories read back as "" until
   * backfilled. Drives category filtering in the app + on the website.
   */
  category: MarketplaceCategory | "";
  /**
   * Price in GBP — the SELL price the customer pays (and what's shown
   * everywhere a buyer looks). 0 means "free" / offers. For variant listings
   * this is the derived minimum variant sell price.
   */
  price: number;
  /**
   * ASBO-RC consignment base price — the figure the Penthouse 7% split is
   * calculated on. ASBO is owed `consignmentPrice × (1 − cutPct/100)`; any
   * amount of `price` above `consignmentPrice` (the "uplift") is kept entirely
   * by Penthouse. Optional: when unset, the base falls back to `price` (uplift
   * £0, i.e. the classic behaviour). Only meaningful when `soldByAsboRc`.
   * Never exposed to buyers or the public website.
   */
  consignmentPrice?: number;
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
   * Whether this listing offers selectable variants (e.g. different colours),
   * each with its own price and stock. When true, the listing's own `price`,
   * `quantity`, `soldCount` and `status` are DERIVED from `variants`:
   *   - price    = minimum variant price (shown as "from £X")
   *   - quantity = sum of variant quantities
   *   - soldCount= sum of variant soldCounts
   *   - status   = "sold" only when every variant is sold out
   * When false, `variants` is empty and the listing behaves as a single item.
   */
  hasVariations: boolean;
  /** The label describing what the variants represent, e.g. "Colour". */
  variationLabel: string;
  /** The variants on offer. Empty unless `hasVariations` is true. */
  variants: ListingVariant[];
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
  /**
   * Admin-only hold (non-variant listings): how many units are reserved for a
   * buyer and therefore not buyable right now (but not sold). Reduces buyable
   * availability: buyable = quantity - soldCount - reservedCount. When nothing
   * buyable remains but stock still exists, the item shows a "Reserved" corner
   * badge and the buy flow is blocked. Purely a display/purchase-gate figure:
   * it never affects stock (quantity/soldCount) and is NEVER recorded on the
   * ASBO-RC ledger. Only an actual sale touches the ledger. Defaults to 0.
   * (For variant listings, holds live per-variant on `variants[].reservedCount`.)
   */
  reservedCount: number;
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
