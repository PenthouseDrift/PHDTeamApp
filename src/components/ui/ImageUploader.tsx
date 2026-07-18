"use client";

import { useState, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";

interface UploadedFile {
  id: string;
  url: string;
  name: string;
  previewUrl: string;
}

interface FileProgress {
  id: string;
  name: string;
  progress: number;
  previewUrl: string;
}

interface FileError {
  name: string;
  message: string;
}

interface ImageUploaderProps {
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  onUploadComplete?: (urls: string[]) => void;
}

const DEFAULT_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ImageUploader({
  maxFiles = 1,
  maxSizeMB = 5,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  onUploadComplete,
}: ImageUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<FileProgress[]>([]);
  const [errors, setErrors] = useState<FileError[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptedTypes.includes(file.type)) {
        const allowed = acceptedTypes
          .map((t) => t.split("/")[1]?.toUpperCase())
          .join(", ");
        return `Invalid file type. Accepted: ${allowed}`;
      }
      if (file.size > maxSizeBytes) {
        return `File too large. Maximum size: ${maxSizeMB}MB`;
      }
      return null;
    },
    [acceptedTypes, maxSizeBytes, maxSizeMB]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remainingSlots = maxFiles - uploadedFiles.length;

      if (remainingSlots <= 0) {
        setErrors([{ name: "", message: `Maximum ${maxFiles} file(s) allowed` }]);
        return;
      }

      const filesToProcess = fileArray.slice(0, remainingSlots);
      const newErrors: FileError[] = [];
      const validFiles: File[] = [];

      for (const file of filesToProcess) {
        const error = validateFile(file);
        if (error) {
          newErrors.push({ name: file.name, message: error });
        } else {
          validFiles.push(file);
        }
      }

      if (fileArray.length > remainingSlots) {
        newErrors.push({
          name: "",
          message: `Only ${remainingSlots} more file(s) can be uploaded`,
        });
      }

      setErrors(newErrors);

      if (validFiles.length === 0) return;

      setUploading((prev) => [
        ...prev,
        ...validFiles.map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          progress: 0,
          previewUrl: URL.createObjectURL(file),
        })),
      ]);

      const uploadPromises = validFiles.map(async (file, index) => {
        const progressId = crypto.randomUUID();

        setUploading((prev) => {
          const updated = [...prev];
          const uploadIndex = prev.length - validFiles.length + index;
          if (updated[uploadIndex]) {
            updated[uploadIndex] = { ...updated[uploadIndex], id: progressId };
          }
          return updated;
        });

        try {
          const blob = await upload(file.name, file, {
            access: "public",
            handleUploadUrl: "/api/upload",
          });

          const uploaded: UploadedFile = {
            id: crypto.randomUUID(),
            url: blob.url,
            name: file.name,
            previewUrl: URL.createObjectURL(file),
          };

          setUploadedFiles((prev) => {
            const next = [...prev, uploaded];
            onUploadComplete?.(next.map((f) => f.url));
            return next;
          });
        } catch (err) {
          setErrors((prev) => [
            ...prev,
            {
              name: file.name,
              message: err instanceof Error ? err.message : "Upload failed",
            },
          ]);
        } finally {
          setUploading((prev) => prev.filter((p) => p.id !== progressId));
        }
      });

      setUploading((prev) => prev); // trigger re-render
      await Promise.allSettled(uploadPromises);
    },
    [maxFiles, uploadedFiles.length, validateFile, onUploadComplete]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles]
  );

  const handleRemove = useCallback(
    (id: string) => {
      setUploadedFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        onUploadComplete?.(next.map((f) => f.url));
        return next;
      });
    },
    [onUploadComplete]
  );

  const acceptString = acceptedTypes.join(",");

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed
          p-8 transition-colors cursor-pointer
          ${
            isDragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
          }
          ${uploadedFiles.length >= maxFiles ? "opacity-50 pointer-events-none" : ""}
        `}
        aria-label="Upload images by dropping files here or clicking to browse"
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"
          />
        </svg>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Click to upload</span> or drag and drop
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          JPEG, PNG, or WebP (max {maxSizeMB}MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptString}
          multiple={maxFiles > 1}
          onChange={handleInputChange}
          aria-hidden="true"
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1" role="alert">
          {errors.map((error, i) => (
            <p key={i} className="text-sm text-red-600 dark:text-red-400">
              {error.name ? `${error.name}: ` : ""}
              {error.message}
            </p>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="space-y-3">
          {uploading.map((file) => (
            <div key={file.id} className="flex items-center gap-3">
              <img
                src={file.previewUrl}
                alt={`Uploading ${file.name}`}
                className="h-12 w-12 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm text-gray-700 dark:text-gray-300">
                  {file.name}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all animate-pulse"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded thumbnails */}
      {uploadedFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {uploadedFiles.map((file) => (
            <div key={file.id} className="group relative aspect-square">
              <img
                src={file.previewUrl}
                alt={file.name}
                className="h-full w-full rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemove(file.id)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label={`Remove ${file.name}`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
