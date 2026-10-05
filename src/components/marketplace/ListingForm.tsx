"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ImageUploader from "@/components/ui/ImageUploader";
import { createListing, updateListing } from "@/actions/marketplace";
import type { MarketplaceListing } from "@/types";

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TITLE_LENGTH = 80;

type ContactMethod = "email" | "phone" | "facebook" | "instagram" | "other";

interface ListingFormProps {
  mode: "create" | "edit";
  /** Required in edit mode: the listing being edited. */
  listing?: MarketplaceListing;
}

export function ListingForm({ mode, listing }: ListingFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const [title, setTitle] = useState(listing?.title ?? "");
  const [price, setPrice] = useState(
    listing ? String(listing.price) : ""
  );
  const [location, setLocation] = useState(listing?.location ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [contactName, setContactName] = useState(listing?.contactName ?? "");
  const [contactMethod, setContactMethod] = useState<ContactMethod>(
    listing?.contactMethod ?? "email"
  );
  const [contactValue, setContactValue] = useState(listing?.contactValue ?? "");
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";

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
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setError("Please enter a valid price (0 for free / offers).");
      return;
    }
    if (!contactValue.trim()) {
      setError("Please add contact details so buyers can reach you.");
      return;
    }
    if (!session?.user?.id) {
      setError("You must be signed in.");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      price: priceNum,
      images,
      location: location.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactMethod,
      contactValue: contactValue.trim(),
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

      {/* Seller contact */}
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
              Contact details
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
              : "Posting..."
            : isEdit
            ? "Save Changes"
            : "Post Listing"}
        </button>
      </div>
    </form>
  );
}
