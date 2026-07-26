"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCar } from "@/actions/cars";
import ImageUploader from "@/components/ui/ImageUploader";
import { useSession } from "next-auth/react";
import { ChassisSelector } from "@/components/cars/ChassisSelector";

export default function NewCarPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [chassis, setChassis] = useState("");
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

    setSubmitting(true);

    try {
      const result = await createCar(session.user.id, {
        name: name.trim(),
        chassis: chassis || undefined,
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
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Add New Car</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Add your RC car with photos to track calibrations and setups.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Car Name */}
          <div>
            <label
              htmlFor="car-name"
              className="block text-sm font-medium text-zinc-600"
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
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {fieldError && (
              <p className="mt-1.5 text-sm text-red-400">{fieldError}</p>
            )}
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {name.length}/50 characters
            </p>
          </div>

          {/* Chassis Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">
              Chassis Model <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Selecting your chassis will auto-fill internal gear ratios in the Calculator.
            </p>
            <ChassisSelector value={chassis} onChange={setChassis} />
          </div>

          {/* Images */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Photos (Optional)
              </label>
              <span className="text-xs text-zinc-400">{images.length}/10 photos</span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Upload multiple photos. The photo marked <span className="font-semibold text-amber-600 dark:text-amber-400">Active</span> is displayed as your main car photo.
            </p>

            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {images.map((url, i) => (
                  <div
                    key={url + i}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-zinc-100 border-2 transition-all ${
                      i === 0
                        ? "border-amber-500 shadow-md ring-2 ring-amber-500/20"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />

                    {/* Active Badge / Set Active button */}
                    {i === 0 ? (
                      <span className="absolute top-2 left-2 rounded-md bg-amber-500 text-black px-2 py-0.5 text-[10px] font-bold shadow-sm flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Active Image
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [url, ...images.filter((_, idx) => idx !== i)];
                          setImages(updated);
                        }}
                        className="absolute top-2 left-2 rounded-md bg-black/75 hover:bg-amber-500 hover:text-black text-white px-2 py-1 text-[10px] font-semibold transition-colors shadow-sm"
                      >
                        Set as Active
                      </button>
                    )}

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md"
                      title="Remove photo"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {images.length < 10 && (
              <ImageUploader
                maxFiles={10 - images.length}
                maxSizeMB={5}
                onUploadComplete={(urls) => setImages([...images, ...urls])}
              />
            )}
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
              className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
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
