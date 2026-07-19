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

    if (images.length === 0) {
      setError("At least one image is required");
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
      <div className="min-h-full bg-zinc-50 px-4 py-6 flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
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
          <h1 className="text-2xl font-bold text-zinc-900">Edit Car</h1>
          <p className="mt-1 text-sm text-zinc-500">Update your car's name and photos.</p>
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
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Photos
            </label>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {images.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-100">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <ImageUploader
              maxFiles={10 - images.length}
              maxSizeMB={5}
              onUploadComplete={(urls) => setImages([...images, ...urls])}
            />
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
