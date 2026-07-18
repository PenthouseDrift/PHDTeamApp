"use client";

import { useState, useCallback } from "react";
import ImageUploader from "@/components/ui/ImageUploader";

const MAX_MESSAGE_LENGTH = 63206;

export default function AdminFacebookPage() {
  const [message, setMessage] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const charCount = message.length;
  const isValid = charCount >= 1 && charCount <= MAX_MESSAGE_LENGTH;

  const handlePublish = async () => {
    if (!isValid) return;

    setPublishing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/facebook/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, imageUrls }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }

      setSuccess(`Post published successfully (ID: ${data.postId})`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleComposeAnother = () => {
    setMessage("");
    setImageUrls([]);
    setSuccess(null);
    setError(null);
  };

  const handleImageUploadComplete = useCallback((urls: string[]) => {
    setImageUrls(urls);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Publish to Facebook</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Compose and publish a post to the Penthouse Drift Facebook page.
        </p>
      </div>

      {success ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-700 bg-green-950/50 p-4">
            <p className="text-green-300">{success}</p>
          </div>
          <button
            type="button"
            onClick={handleComposeAnother}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Compose Another
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Error display */}
          {error && (
            <div
              className="rounded-lg border border-red-700 bg-red-950/50 p-4"
              role="alert"
            >
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Post composition form */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Form */}
            <div className="space-y-4">
              {/* Message textarea */}
              <div>
                <label
                  htmlFor="post-message"
                  className="block text-sm font-medium text-zinc-300 mb-1"
                >
                  Message
                </label>
                <textarea
                  id="post-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={8}
                  placeholder="What's on your mind?"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                />
                <p
                  className={`mt-1 text-xs ${
                    charCount > MAX_MESSAGE_LENGTH
                      ? "text-red-400"
                      : "text-zinc-500"
                  }`}
                >
                  {charCount.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()} characters
                </p>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Images (optional, up to 4)
                </label>
                <ImageUploader
                  maxFiles={4}
                  acceptedTypes={["image/jpeg", "image/png"]}
                  maxSizeMB={4}
                  onUploadComplete={handleImageUploadComplete}
                />
              </div>

              {/* Publish button */}
              <button
                type="button"
                onClick={handlePublish}
                disabled={!isValid || publishing}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {publishing ? "Publishing..." : "Publish to Facebook"}
              </button>
            </div>

            {/* Right: Preview */}
            <div>
              <p className="text-sm font-medium text-zinc-300 mb-2">Preview</p>
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                {message || imageUrls.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-zinc-700" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          Penthouse Drift
                        </p>
                        <p className="text-xs text-zinc-500">Just now</p>
                      </div>
                    </div>
                    {message && (
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
                        {message}
                      </p>
                    )}
                    {imageUrls.length > 0 && (
                      <div
                        className={`grid gap-1 ${
                          imageUrls.length === 1
                            ? "grid-cols-1"
                            : "grid-cols-2"
                        }`}
                      >
                        {imageUrls.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Attached image ${i + 1}`}
                            className="w-full rounded object-cover aspect-square"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-8">
                    Start typing to see a preview
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
