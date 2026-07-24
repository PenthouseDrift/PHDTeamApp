"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getCar, updateCar } from "@/actions/cars";
import ImageUploader from "@/components/ui/ImageUploader";
import Link from "next/link";

export default function EditCarPage() {
  const { carId } = useParams<{ carId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadCar() {
      if (!session?.user?.id) return;
      const result = await getCar(carId, session.user.id);
      if (result.success) {
        setName(result.data.name);
        setImages(result.data.images);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    loadCar();
  }, [carId, session?.user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!session?.user?.id) {
      setError("You must be logged in");
      return;
    }

    if (!name.trim() || name.trim().length > 50) {
      setError("Car name must be between 1 and 50 characters");
      return;
    }

    setSubmitting(true);
    try {
      const result = await updateCar(carId, session.user.id, {
        name: name.trim(),
        images,
      });

      if (result.success) {
        router.push(`/cars/${carId}`);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 flex items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/cars/${carId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Car
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Edit Car</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Update your car's name and photos.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="car-name" className="block text-sm font-medium text-zinc-700">
              Car Name
            </label>
            <input
              id="car-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1.5 text-xs text-zinc-400">{name.length}/50 characters</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
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

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(`/cars/${carId}`)}
              className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
