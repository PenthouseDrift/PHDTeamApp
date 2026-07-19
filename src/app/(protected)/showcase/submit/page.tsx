"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ImageUploader from "@/components/ui/ImageUploader";
import { submitShell } from "@/actions/showcase";

const MAX_DESCRIPTION_LENGTH = 500;

export default function SubmitShellPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

  const [imageUrl, setImageUrl] = useState<string>("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleUploadComplete = (urls: string[]) => {
    setImageUrl(urls[0] || "");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!imageUrl) {
      setError("Please upload an image of your shell.");
      return;
    }

    if (!session?.user?.id) {
      setError("You must be signed in to submit.");
      return;
    }

    startTransition(async () => {
      const result = await submitShell(session.user.id, {
        imageUrl,
        description: description.trim() || undefined,
      });

      if (result.success) {
        router.push("/showcase");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Submit Your Shell</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Share your custom shell design with the community
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Shell Image
            </label>
            <ImageUploader
              maxFiles={1}
              maxSizeMB={5}
              onUploadComplete={handleUploadComplete}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label
              htmlFor="description"
              className="block text-sm font-medium text-zinc-600"
            >
              Description{" "}
              <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= MAX_DESCRIPTION_LENGTH) {
                  setDescription(e.target.value);
                }
              }}
              placeholder="Tell us about your shell design..."
              rows={4}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
            <p className="text-right text-xs text-zinc-500 dark:text-zinc-400">
              {description.length}/{MAX_DESCRIPTION_LENGTH}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3" role="alert">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !imageUrl}
            className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Submitting..." : "Submit Shell"}
          </button>
        </form>
      </div>
    </div>
  );
}
