"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { shareCalibration } from "@/actions/calibration";

interface ShareCalibrationButtonProps {
  calibrationId: string;
}

export function ShareCalibrationButton({ calibrationId }: ShareCalibrationButtonProps) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user?.id) return;

    startTransition(async () => {
      const result = await shareCalibration(calibrationId, session.user.id);
      if (result.success) {
        setShareUrl(result.data.shareUrl);
        // Auto copy
        try {
          await navigator.clipboard.writeText(result.data.shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard might not be available
        }
      }
    });
  }

  if (shareUrl) {
    return (
      <span
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded"
      >
        {copied ? "Link copied!" : "Shared ✓"}
      </span>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 1 1 0-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 1 0 5.367-2.684 3 3 0 0 0-5.367 2.684Zm0 9.316a3 3 0 1 0 5.368 2.684 3 3 0 0 0-5.368-2.684Z" />
      </svg>
      {isPending ? "..." : "Share"}
    </button>
  );
}
