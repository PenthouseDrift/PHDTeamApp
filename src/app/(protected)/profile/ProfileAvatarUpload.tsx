"use client";

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { updateProfileAvatar } from "@/actions/profile";

interface ProfileAvatarUploadProps {
  currentAvatar: string | null;
  userId: string;
  initials: string;
}

export function ProfileAvatarUpload({ currentAvatar, userId, initials }: ProfileAvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatar);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(false);

    // Validate
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB.");
      return;
    }

    setUploading(true);

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      // Save to Redis
      const result = await updateProfileAvatar(userId, blob.url);
      if (result.success) {
        setAvatarUrl(blob.url);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-6">
      {/* Current avatar preview */}
      <div className="shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Profile"
            className="h-20 w-20 rounded-full object-cover ring-2 ring-zinc-200"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-amber-500 flex items-center justify-center text-2xl font-bold text-white">
            {initials}
          </div>
        )}
      </div>

      {/* Upload controls */}
      <div className="flex flex-col gap-2">
        <label
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
            uploading
              ? "bg-zinc-100 text-zinc-500 cursor-not-allowed"
              : "bg-zinc-900 text-white hover:bg-zinc-800"
          }`}
        >
          {uploading ? "Uploading..." : "Upload Photo"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-xs text-zinc-500">JPEG, PNG, or WebP. Max 5MB.</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {success && <p className="text-xs text-green-600">Profile picture updated!</p>}
      </div>
    </div>
  );
}
