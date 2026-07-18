"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCar } from "@/actions/cars";
import ImageUploader from "@/components/ui/ImageUploader";
import { useSession } from "next-auth/react";

export default function NewCarPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!session?.user?.id) {
      setError("You must be logged in");
      return;
    }

    if (!name.trim()) {
      setFieldError("Car name is required");
      return;
    }

    if (name.trim().length > 50) {
      setFieldError("Car name must be 50 characters or less");
      return;
    }

    if (images.length === 0) {
      setError("At least one image is required");
      return;
    }

    setSubmitting(true);

    try {
      const result = await createCar(session.user.id, {
        name: name.trim(),
        images,
      });

      if (result.success) {
        router.refresh();
        router.push("/cars");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Add New Car</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Add your RC car with photos to track calibrations and setups.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Car Name */}
          <div>
            <label
              htmlFor="car-name"
              className="block text-sm font-medium text-zinc-300"
            >
              Car Name
            </label>
            <input
              id="car-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldError(null);
              }}
              placeholder="e.g. Yokomo YD-2SX III"
              maxLength={50}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {fieldError && (
              <p className="mt-1.5 text-sm text-red-400">{fieldError}</p>
            )}
            <p className="mt-1.5 text-xs text-zinc-500">
              {name.length}/50 characters
            </p>
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Photos
            </label>
            <ImageUploader
              maxFiles={10}
              maxSizeMB={5}
              onUploadComplete={(urls) => setImages(urls)}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-800 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/cars")}
              className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Car"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
