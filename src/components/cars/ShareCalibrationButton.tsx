"use client";

import { useState, useTransition, useEffect } from "react";
import { useSession } from "next-auth/react";
import { shareCalibration } from "@/actions/calibration";
import QRCode from "qrcode";

interface ShareCalibrationButtonProps {
  calibrationId: string;
  calibrationName: string;
}

export function ShareCalibrationButton({ calibrationId, calibrationName }: ShareCalibrationButtonProps) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shareUrl) {
      QRCode.toDataURL(shareUrl, { width: 200, margin: 2 }).then(setQrDataUrl);
    }
  }, [shareUrl]);

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user?.id) return;

    startTransition(async () => {
      const result = await shareCalibration(calibrationId, session.user.id);
      if (result.success) {
        setShareUrl(result.data.shareUrl);
        setShowModal(true);
      }
    });
  }

  async function handleNativeShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: `${calibrationName} — Penthouse Drift`,
        text: `Check out this calibration setup: ${calibrationName}`,
        url: shareUrl,
      });
    } catch {
      // User cancelled or not supported
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <>
      <button
        onClick={handleShare}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 1 1 0-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 1 0 5.367-2.684 3 3 0 0 0-5.367 2.684Zm0 9.316a3 3 0 1 0 5.368 2.684 3 3 0 0 0-5.368-2.684Z" />
        </svg>
        {isPending ? "..." : "Share"}
      </button>

      {/* Share Modal */}
      {showModal && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-lg font-semibold text-zinc-900">Share Calibration</h3>
              <p className="text-sm text-zinc-500 mt-1">{calibrationName}</p>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="flex justify-center">
                <div className="rounded-xl border border-zinc-200 p-3 bg-white">
                  <img src={qrDataUrl} alt="Share QR Code" width={200} height={200} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              {/* Native share (mobile) */}
              {"share" in navigator && (
                <button
                  onClick={handleNativeShare}
                  className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
                >
                  Share via...
                </button>
              )}

              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
              >
                {copied ? "✓ Link Copied!" : "Copy Link"}
              </button>

              {/* Close */}
              <button
                onClick={() => setShowModal(false)}
                className="w-full text-sm text-zinc-400 hover:text-zinc-600 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
