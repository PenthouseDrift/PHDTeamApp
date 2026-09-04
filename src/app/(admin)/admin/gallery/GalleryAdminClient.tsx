"use client";

import { useCallback, useState, useTransition } from "react";
import Image from "next/image";
import ImageUploader from "@/components/ui/ImageUploader";
import {
  addGalleryImage,
  deleteGalleryImage,
  toggleGalleryVisibility,
} from "@/actions/admin/gallery";
import type { GalleryImage } from "@/types";

export function GalleryAdminClient({
  initialImages,
}: {
  initialImages: GalleryImage[];
}) {
  const [images, setImages] = useState<GalleryImage[]>(initialImages);
  const [pendingUrl, setPendingUrl] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [showOnWebsite, setShowOnWebsite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  // ImageUploader invokes onUploadComplete from inside a state updater (during
  // its render), so defer our setState to a microtask to avoid the
  // "Cannot update a component while rendering a different component" warning.
  const handleUploadComplete = useCallback((urls: string[]) => {
    queueMicrotask(() => setPendingUrl(urls[0] ?? ""));
  }, []);

  function handleAdd() {
    setError(null);
    if (!pendingUrl) {
      setError("Upload an image first.");
      return;
    }
    startTransition(async () => {
      const res = await addGalleryImage({
        imageUrl: pendingUrl,
        caption: caption.trim(),
        showOnWebsite,
      });
      if (res.success) {
        setImages((prev) => [res.data, ...prev]);
        setPendingUrl("");
        setCaption("");
        setShowOnWebsite(true);
        setUploaderKey((k) => k + 1); // reset uploader
      } else {
        setError(res.error);
      }
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      const res = await toggleGalleryVisibility(id);
      if (res.success) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, showOnWebsite: res.data.showOnWebsite } : img
          )
        );
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteGalleryImage(id);
      if (res.success) {
        setImages((prev) => prev.filter((img) => img.id !== id));
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Upload / add form */}
      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-5 sm:p-6 space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Add Photo
        </h2>

        <ImageUploader
          key={uploaderKey}
          maxFiles={1}
          label="Website Gallery Image"
          onUploadComplete={handleUploadComplete}
        />

        <div className="space-y-2">
          <label
            htmlFor="gallery-caption"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Caption (optional)
          </label>
          <input
            id="gallery-caption"
            type="text"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Saturday track night tandems"
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={showOnWebsite}
            onChange={(e) => setShowOnWebsite(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-500/50"
          />
          Show on public website
        </label>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !pendingUrl}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-black transition-all hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : "Add to Gallery"}
        </button>
      </div>

      {/* Existing images */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Gallery Images ({images.length})
        </h2>

        {images.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No images yet. Upload one above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => (
              <div
                key={img.id}
                className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden flex flex-col"
              >
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={img.imageUrl}
                    alt={img.caption || "Gallery image"}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                  {!img.showOnWebsite && (
                    <span className="absolute top-2 left-2 rounded-full bg-zinc-900/80 text-white text-[10px] font-bold px-2 py-0.5">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  {img.caption && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                      {img.caption}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(img.id)}
                      disabled={isPending}
                      className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                    >
                      {img.showOnWebsite ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(img.id)}
                      disabled={isPending}
                      className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
