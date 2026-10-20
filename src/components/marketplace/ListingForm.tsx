"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ImageUploader from "@/components/ui/ImageUploader";
import { createListing, updateListing } from "@/actions/marketplace";
import type { MarketplaceListing, MarketplaceCategory } from "@/types";
import { MARKETPLACE_CATEGORIES } from "@/types";

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TITLE_LENGTH = 80;

type ContactMethod = "email" | "phone" | "facebook" | "instagram" | "other";

interface ListingFormProps {
  mode: "create" | "edit";
  /** Required in edit mode: the listing being edited. */
  listing?: MarketplaceListing;
  /**
   * Viewer's role resolved on the SERVER (honours dev impersonation reliably,
   * unlike the client useSession() which can be stale). Drives which
   * admin/ASBO-RC-only controls are shown. The server actions re-check anyway.
   */
  viewerRole?: "admin" | "moderator" | "member" | "asbo-rc";
}

export function ListingForm({ mode, listing, viewerRole }: ListingFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const [title, setTitle] = useState(listing?.title ?? "");
  const [price, setPrice] = useState(
    listing ? String(listing.price) : ""
  );
  // ASBO consignment base (the 7% split runs on this; uplift above it is kept
  // by Penthouse). Empty => falls back to the sell price.
  const [consignmentPrice, setConsignmentPrice] = useState(
    listing?.consignmentPrice != null ? String(listing.consignmentPrice) : ""
  );
  const [location, setLocation] = useState(listing?.location ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [category, setCategory] = useState<MarketplaceCategory | "">(listing?.category ?? "");
  const [contactName, setContactName] = useState(listing?.contactName ?? "");
  const [contactMethod, setContactMethod] = useState<ContactMethod>(
    listing?.contactMethod ?? "email"
  );
  const [contactValue, setContactValue] = useState(listing?.contactValue ?? "");
  const [atTrack, setAtTrack] = useState(listing?.atTrack ?? false);
  const [meetAtTrack, setMeetAtTrack] = useState(listing?.meetAtTrack ?? false);
  const [quantity, setQuantity] = useState(
    listing?.quantity && listing.quantity > 0 ? String(listing.quantity) : "1"
  );
  const [soldByAsboRc, setSoldByAsboRc] = useState(listing?.soldByAsboRc ?? false);
  const [soldByPhd, setSoldByPhd] = useState(listing?.soldByPhd ?? false);
  const [saveAsDraft, setSaveAsDraft] = useState(listing?.isDraft ?? false);

  // Variants (available to all sellers). Each has its own price + stock.
  const [hasVariations, setHasVariations] = useState(listing?.hasVariations ?? false);
  const [variationLabel, setVariationLabel] = useState(listing?.variationLabel ?? "");
  const [variants, setVariants] = useState<
    { id?: string; name: string; price: string; consignmentPrice: string; quantity: string }[]
  >(
    listing?.variants?.length
      ? listing.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: String(v.price),
          consignmentPrice: v.consignmentPrice != null ? String(v.consignmentPrice) : "",
          quantity: String(v.quantity),
        }))
      : [{ name: "", price: "", consignmentPrice: "", quantity: "1" }]
  );

  const [error, setError] = useState<string | null>(null);

  const addVariant = () =>
    setVariants((vs) => [...vs, { name: "", price: "", consignmentPrice: "", quantity: "1" }]);
  const removeVariant = (i: number) =>
    setVariants((vs) => (vs.length > 1 ? vs.filter((_, idx) => idx !== i) : vs));
  const updateVariant = (
    i: number,
    field: "name" | "price" | "consignmentPrice" | "quantity",
    value: string
  ) => setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));

  const isEdit = mode === "edit";
  // Prefer the server-resolved role (reliable under impersonation); fall back
  // to the client session only if a role wasn't passed in.
  const role = viewerRole ?? session?.user?.role;
  // Only admins and ASBO-RC partners may flag an item as ASBO-RC consignment.
  const canSellForAsboRc = role === "admin" || role === "asbo-rc";
  // Only admins control the standalone "Sold by PHD" badge. ASBO-RC partners
  // don't see it — PHD facilitates the sale, so it's set for them automatically.
  const isAdmin = role === "admin";
  // ASBO consignment always implies the "Sold by PHD" badge.
  const effectiveSoldByPhd = soldByPhd || soldByAsboRc;

  // Ticking "Provided by ASBO-RC" auto-selects "Sold by PHD".
  const handleToggleAsboRc = (checked: boolean) => {
    setSoldByAsboRc(checked);
    if (checked) setSoldByPhd(true);
  };

  const handleUploadComplete = (urls: string[]) => {
    setImages(urls);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (images.length === 0) {
      setError("Please upload at least one photo of your item.");
      return;
    }
    if (title.trim().length < 2) {
      setError("Please give your listing a title.");
      return;
    }
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setError("Please enter a valid price (0 for free / offers).");
      return;
    }
    // ASBO consignment base (non-variant): must be valid and not above sell price.
    const consignmentNum = consignmentPrice.trim() === "" ? undefined : Number(consignmentPrice);
    if (
      soldByAsboRc &&
      !hasVariations &&
      consignmentNum != null &&
      (Number.isNaN(consignmentNum) || consignmentNum < 0 || consignmentNum > priceNum)
    ) {
      setError("Consignment price can't be higher than the sell price.");
      return;
    }
    const quantityNum = Math.max(1, Math.floor(Number(quantity) || 1));
    if (!hasVariations && (Number.isNaN(quantityNum) || quantityNum < 1)) {
      setError("Quantity must be at least 1.");
      return;
    }

    // Validate variants when enabled.
    let cleanVariants: {
      id?: string;
      name: string;
      price: number;
      consignmentPrice?: number;
      quantity: number;
    }[] = [];
    if (hasVariations) {
      if (!variationLabel.trim()) {
        setError("Add a label for your variations (e.g. 'Colour').");
        return;
      }
      const rows = variants
        .map((v) => ({
          id: v.id,
          name: v.name.trim(),
          price: Number(v.price),
          consignmentPrice: v.consignmentPrice.trim() === "" ? undefined : Number(v.consignmentPrice),
          quantity: Math.floor(Number(v.quantity)),
        }))
        .filter((v) => v.name.length > 0);
      if (rows.length === 0) {
        setError("Add at least one variation, or turn variations off.");
        return;
      }
      for (const r of rows) {
        if (Number.isNaN(r.price) || r.price < 0) {
          setError(`Enter a valid price for "${r.name}".`);
          return;
        }
        if (Number.isNaN(r.quantity) || r.quantity < 0) {
          setError(`Enter a valid quantity for "${r.name}".`);
          return;
        }
        if (
          soldByAsboRc &&
          r.consignmentPrice != null &&
          (Number.isNaN(r.consignmentPrice) || r.consignmentPrice > r.price)
        ) {
          setError(`Consignment price for "${r.name}" can't be higher than its sell price.`);
          return;
        }
      }
      const names = rows.map((r) => r.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        setError("Each variation must have a unique name.");
        return;
      }
      cleanVariants = rows;
    }
    // Sold-by-PHD / ASBO consignment items are bought in person at the track,
    // so no seller contact is required.
    const boughtAtTrack = effectiveSoldByPhd || soldByAsboRc;
    if (!boughtAtTrack && !meetAtTrack && !contactValue.trim()) {
      setError("Add contact details, or tick 'Meet at the track'.");
      return;
    }
    if (!session?.user?.id) {
      setError("You must be signed in.");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category as MarketplaceCategory,
      price: priceNum,
      images,
      location: location.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactMethod,
      contactValue: contactValue.trim(),
      atTrack,
      meetAtTrack,
      quantity: quantityNum,
      // Only send the flags when the viewer is allowed to set them; the server
      // re-checks the role before trusting these.
      soldByAsboRc: canSellForAsboRc ? soldByAsboRc : undefined,
      // Admins set the badge directly; ASBO implies it (server enforces too).
      soldByPhd: isAdmin ? effectiveSoldByPhd : undefined,
      // Draft is only meaningful at creation (editing never flips draft/live —
      // that's done via Publish). Admin/ASBO-RC only; server re-checks.
      isDraft: !isEdit && canSellForAsboRc ? saveAsDraft : undefined,
      // Variants (any seller). When off, send false so an edit can also clear them.
      hasVariations,
      variationLabel: hasVariations ? variationLabel.trim() : "",
      variants: hasVariations ? cleanVariants : [],
      // ASBO consignment base (non-variant). Only sent for ASBO items; omitted
      // (undefined) when blank so it falls back to the sell price server-side.
      consignmentPrice:
        soldByAsboRc && !hasVariations && consignmentNum != null ? consignmentNum : undefined,
    };

    startTransition(async () => {
      const result =
        isEdit && listing
          ? await updateListing(listing.listingId, payload)
          : await createListing(session.user.id, payload);

      if (result.success) {
        if (isEdit && listing) {
          router.push(`/marketplace/${listing.listingId}`);
        } else {
          router.push("/marketplace");
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Images */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Photos <span className="text-zinc-500 dark:text-zinc-400">(up to 6)</span>
        </label>
        <ImageUploader
          maxFiles={6}
          maxSizeMB={5}
          initialUrls={listing?.images ?? []}
          onUploadComplete={handleUploadComplete}
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH))}
          placeholder="e.g. Yokomo SD2.0 chassis"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          maxLength={MAX_TITLE_LENGTH}
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label htmlFor="category" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Category
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as MarketplaceCategory | "")}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="" disabled>
            Choose a category…
          </option>
          {MARKETPLACE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Price + Location */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="price" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Price (£)
          </label>
          <input
            id="price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0 for free / offers"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="location" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Location <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value.slice(0, 80))}
            placeholder="e.g. collect at the track"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            maxLength={80}
          />
        </div>
      </div>

      {/* Consignment price — ASBO consignment items only, non-variant. The 7%
          split is based on this; anything the sell price is above it is kept by
          Penthouse. Blank => uses the sell price (no uplift). */}
      {canSellForAsboRc && soldByAsboRc && !hasVariations && (
        <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/40 p-4 dark:border-teal-500/30 dark:bg-teal-500/5">
          <label htmlFor="consignmentPrice" className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Consignment price (ASBO) <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <input
            id="consignmentPrice"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={consignmentPrice}
            onChange={(e) => setConsignmentPrice(e.target.value)}
            placeholder={price ? `Defaults to £${price}` : "Defaults to the sell price"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            The price the ASBO-RC 7% split is based on. ASBO is owed 93% of this; anything the
            sell price above is kept entirely by Penthouse. Leave blank to use the sell price.
          </p>
        </div>
      )}

      {/* Quantity — available to everyone, defaults to 1. Hidden when the
          listing uses variations (stock is then tracked per-variant). */}
      {!hasVariations && (
      <div className="space-y-2">
        <label htmlFor="quantity" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Quantity
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => String(Math.max(1, (Number(q) || 1) - 1)))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={() => setQuantity((q) => String(Math.max(1, Math.floor(Number(q) || 1))))}
            className="h-11 w-24 rounded-lg border border-zinc-300 bg-white px-4 text-center text-sm font-semibold text-zinc-900 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => String(Math.max(1, (Number(q) || 1) + 1)))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            +
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            How many units are available (defaults to 1).
          </span>
        </div>
      </div>
      )}

      {/* Variations — available to everyone. Each variant has its own price +
          stock. When on, the single Price/Quantity above are replaced by the
          per-variant rows below. */}
      <label
        htmlFor="hasVariations"
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
          hasVariations
            ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
            : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        }`}
      >
        <input
          id="hasVariations"
          type="checkbox"
          checked={hasVariations}
          onChange={(e) => setHasVariations(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-amber-500 focus:ring-amber-500 dark:border-zinc-600"
        />
        <span>
          <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Add variations
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Offer options like colour or size, each with its own price and stock.
            When on, the single price and quantity above are replaced by the rows below.
          </span>
        </span>
      </label>

      {hasVariations && (
        <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
          {/* Variation label */}
          <div className="space-y-2">
            <label htmlFor="variationLabel" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Variation label
            </label>
            <input
              id="variationLabel"
              type="text"
              value={variationLabel}
              onChange={(e) => setVariationLabel(e.target.value.slice(0, 40))}
              placeholder="e.g. Colour"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              maxLength={40}
            />
          </div>

          {/* Variant rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {variationLabel.trim() || "Variations"}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {variants.length} option{variants.length === 1 ? "" : "s"}
              </span>
            </div>

            {variants.map((v, i) => (
              <div key={v.id ?? i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {i === 0 && (
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Name
                    </label>
                  )}
                  <input
                    type="text"
                    value={v.name}
                    onChange={(e) => updateVariant(i, "name", e.target.value.slice(0, 60))}
                    placeholder="e.g. Black"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    maxLength={60}
                  />
                </div>
                <div className="w-24 space-y-1">
                  {i === 0 && (
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Price (£)
                    </label>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={v.price}
                    onChange={(e) => updateVariant(i, "price", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                {canSellForAsboRc && soldByAsboRc && (
                  <div className="w-24 space-y-1">
                    {i === 0 && (
                      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Consign. (£)
                      </label>
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={v.consignmentPrice}
                      onChange={(e) => updateVariant(i, "consignmentPrice", e.target.value)}
                      placeholder={v.price ? v.price : "sell"}
                      title="ASBO consignment base for this variation (defaults to its sell price)"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                )}
                <div className="w-20 space-y-1">
                  {i === 0 && (
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Qty
                    </label>
                  )}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={v.quantity}
                    onChange={(e) => updateVariant(i, "quantity", e.target.value)}
                    placeholder="1"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Remove variation"
                  onClick={() => removeVariant(i)}
                  disabled={variants.length <= 1}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-red-950/40"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10"
            >
              + Add another
            </button>
          </div>
        </div>
      )}

      {/* At the track */}
      <label
        htmlFor="atTrack"
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
          atTrack
            ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
            : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        }`}
      >
        <input
          id="atTrack"
          type="checkbox"
          checked={atTrack}
          onChange={(e) => setAtTrack(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-amber-500 focus:ring-amber-500 dark:border-zinc-600"
        />
        <span>
          <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            This item is at Penthouse Drift
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            The item is at the track and can be bought in person. Buyers will see an
            &ldquo;Available at the track&rdquo; badge on your listing.
          </span>
        </span>
      </label>

      {/* Sold by ASBO-RC — admins & ASBO-RC partners only */}
      {/* Provided by ASBO-RC (consignment) — admins & ASBO-RC partners */}
      {canSellForAsboRc && (
        <label
          htmlFor="soldByAsboRc"
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
            soldByAsboRc
              ? "border-teal-400 bg-teal-50 dark:border-teal-500/50 dark:bg-teal-500/10"
              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
          }`}
        >
          <input
            id="soldByAsboRc"
            type="checkbox"
            checked={soldByAsboRc}
            onChange={(e) => handleToggleAsboRc(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-teal-500 focus:ring-teal-500 dark:border-zinc-600"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Provided by ASBO-RC
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              ASBO-RC consignment stock sold on their behalf. The price above is the RRP;
              Penthouse Drift keeps 7% and the rest is owed to ASBO-RC. These items appear in
              the ASBO-RC Reports{isAdmin ? " and are shown as \u201cSold by PHD\u201d to customers." : "."}
            </span>
          </span>
        </label>
      )}

      {/* Sold by PHD badge — admins only (ASBO consignment implies it) */}
      {isAdmin && (
        <label
          htmlFor="soldByPhd"
          className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
            soldByAsboRc ? "cursor-not-allowed opacity-70" : "cursor-pointer"
          } ${
            effectiveSoldByPhd
              ? "border-teal-400 bg-teal-50 dark:border-teal-500/50 dark:bg-teal-500/10"
              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
          }`}
        >
          <input
            id="soldByPhd"
            type="checkbox"
            checked={effectiveSoldByPhd}
            disabled={soldByAsboRc}
            onChange={(e) => setSoldByPhd(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-teal-500 focus:ring-teal-500 disabled:opacity-60 dark:border-zinc-600"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Sold by PHD
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              Shows a &ldquo;Sold by PHD&rdquo; badge on the advert — for items Penthouse Drift
              sells itself.
              {soldByAsboRc && " Automatically on for ASBO-RC consignment items."}
            </span>
          </span>
        </label>
      )}

      {/* Save as draft — admins & ASBO-RC only, create mode only. Lets staff
          stock an item privately now and publish it later. */}
      {canSellForAsboRc && !isEdit && (
        <label
          htmlFor="saveAsDraft"
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
            saveAsDraft
              ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
          }`}
        >
          <input
            id="saveAsDraft"
            type="checkbox"
            checked={saveAsDraft}
            onChange={(e) => setSaveAsDraft(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-amber-500 focus:ring-amber-500 dark:border-zinc-600"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Save as draft (stock now, publish later)
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              The item is stocked but stays hidden from members and the public website until
              you publish it. You can publish any time from the marketplace.
            </span>
          </span>
        </label>
      )}

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Description <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= MAX_DESCRIPTION_LENGTH) {
              setDescription(e.target.value);
            }
          }}
          placeholder="Condition, specs, what's included..."
          rows={5}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          maxLength={MAX_DESCRIPTION_LENGTH}
        />
        <p className="text-right text-xs text-zinc-500 dark:text-zinc-400">
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </p>
      </div>

      {/* Seller contact — hidden for Sold-by-PHD items (bought at the track). */}
      {effectiveSoldByPhd ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 text-sm text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200">
          <span className="font-semibold">Sold by PHD:</span> buyers come to the track to buy in
          person, so no seller contact is shown on this listing.
        </div>
      ) : (
      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            How should buyers reach you?
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            This is shown publicly on your listing (including the website). Only share what
            you&apos;re comfortable making public — it won&apos;t use your account email unless
            you type it here.
          </p>
        </div>

        {/* Meet at track — no personal contact needed */}
        <label
          htmlFor="meetAtTrack"
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            meetAtTrack
              ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
              : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:bg-zinc-800"
          }`}
        >
          <input
            id="meetAtTrack"
            type="checkbox"
            checked={meetAtTrack}
            onChange={(e) => setMeetAtTrack(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-amber-500 focus:ring-amber-500 dark:border-zinc-600"
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Meet at the track
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              Buyers arrange the sale with you in person at Penthouse Drift. No email or phone
              needed — you can still add a contact below if you&apos;d like.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <label htmlFor="contactName" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Contact name <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
          </label>
          <input
            id="contactName"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value.slice(0, 60))}
            placeholder="e.g. Alex"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            maxLength={60}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="contactMethod" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Method
            </label>
            <select
              id="contactMethod"
              value={contactMethod}
              onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="email">Email</option>
              <option value="phone">Phone / WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="contactValue" className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Contact details {meetAtTrack && <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>}
            </label>
            <input
              id="contactValue"
              type="text"
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value.slice(0, 120))}
              placeholder={
                contactMethod === "email"
                  ? "you@example.com"
                  : contactMethod === "phone"
                  ? "+44 7700 900000"
                  : contactMethod === "facebook"
                  ? "facebook.com/yourprofile"
                  : contactMethod === "instagram"
                  ? "@yourhandle"
                  : "How to reach you"
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              maxLength={120}
            />
          </div>
        </div>
      </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3" role="alert">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isEdit && (
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || images.length === 0}
          className="flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? isEdit
              ? "Saving..."
              : saveAsDraft
              ? "Saving draft..."
              : "Posting..."
            : isEdit
            ? "Save Changes"
            : saveAsDraft
            ? "Save Draft"
            : "Post Listing"}
        </button>
      </div>
    </form>
  );
}
