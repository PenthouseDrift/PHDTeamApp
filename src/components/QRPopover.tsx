"use client";

import { useState, useEffect, useRef } from "react";
import { getOrCreateQRCode } from "@/actions/qr";

interface QRPopoverProps {
  userId: string;
  variant?: "icon" | "button";
  buttonText?: string;
}

export function QRPopover({ userId, variant = "icon", buttonText = "Show QR code" }: QRPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOpenEvent() {
      setIsOpen(true);
    }
    window.addEventListener("open-qr-popover", handleOpenEvent);
    return () => window.removeEventListener("open-qr-popover", handleOpenEvent);
  }, []);

  useEffect(() => {
    if (!isOpen || qrCodeUrl || !userId) return;
    let isMounted = true;

    async function loadQR() {
      setLoading(true);
      try {
        const res = await getOrCreateQRCode(userId);
        if (res.success && isMounted) {
          setQrCodeUrl(res.data);
        }
      } catch (err) {
        console.error("Failed to load QR code:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadQR();
    return () => {
      isMounted = false;
    };
  }, [isOpen, qrCodeUrl, userId]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const panelContent = (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📱</span>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Member Account QR Code</h3>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Show to track admin for check-in & wallet redemption</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 text-sm font-bold"
        >
          ✕
        </button>
      </div>

      {/* Main Track Membership QR Code */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white p-3 text-center space-y-2 shadow-sm">
        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-900 uppercase tracking-wider">
          Main Member QR Code
        </p>
        {loading ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-zinc-400">Loading QR Code...</p>
          </div>
        ) : qrCodeUrl ? (
          <div className="space-y-2">
            <img
              src={qrCodeUrl}
              alt="Member Account Check-In QR Code"
              className="w-48 h-48 mx-auto object-contain rounded-lg"
            />
            <p className="text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 inline-block">
              ID: {userId}
            </p>
          </div>
        ) : (
          <p className="text-xs text-red-500 py-4">Unable to load QR Code.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
          </svg>
          <span>{buttonText}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Your QR Code"
          title="View Check-In QR Codes"
          className="relative p-2 text-zinc-600 dark:text-zinc-300 hover:text-amber-500 dark:hover:text-amber-400 transition-colors focus:outline-none"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <>
          {/* Mobile fixed dropdown */}
          <div className="fixed top-16 left-3 right-3 z-[9999] md:hidden">
            {panelContent}
          </div>

          {/* Desktop dropdown */}
          <div className="hidden md:block absolute right-0 top-full mt-2 w-80 z-[9999]">
            {panelContent}
          </div>
        </>
      )}
    </div>
  );
}
