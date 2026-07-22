"use client";

import { useState, useTransition } from "react";
import { createPost } from "@/actions/feed";
import ImageUploader from "@/components/ui/ImageUploader";

interface CreatePostFormProps {
  userId: string;
  userImage?: string | null;
  userName?: string | null;
}

export function CreatePostForm({ userId, userImage, userName }: CreatePostFormProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!text.trim() && images.length === 0) return;

    startTransition(async () => {
      const result = await createPost(userId, text, images);
      if (result.success) {
        setText("");
        setImages([]);
        setShowUploader(false);
      }
    });
  }

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <div className="flex gap-3">
        {userImage ? (
          <img src={userImage} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {userName?.[0] || "?"}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening at the track?"
          rows={2}
          maxLength={2000}
          className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {showUploader && (
        <div className="pl-12">
          <ImageUploader maxFiles={4} maxSizeMB={5} onUploadComplete={setImages} />
        </div>
      )}

      <div className="flex items-center justify-between pl-12">
        <button
          type="button"
          onClick={() => setShowUploader(!showUploader)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 21h18a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 21 3H3a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 3 21Z" />
          </svg>
          Photo
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || (!text.trim() && images.length === 0)}
          className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
