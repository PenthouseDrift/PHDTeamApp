"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function StaticTrackQRPoster() {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [targetUrl, setTargetUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/track-checkin`;
      setTargetUrl(url);

      QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      }).then(setQrDataUrl);
    }
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4 text-center">
      <div className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-700">
          Track Arrival Poster
        </span>
        <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
          Self Check-In Poster QR Code
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
          Print or display this static QR code at the track entrance. Members scan with their phone camera to check in themselves or their guests.
        </p>
      </div>

      {/* QR Code Container */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 max-w-xs mx-auto shadow-md space-y-3">
        <div className="bg-white p-3 rounded-xl shadow-inner inline-block">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Self Check-In QR Code" className="w-56 h-56 mx-auto rounded-lg" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-xs text-zinc-400 animate-pulse">
              Generating Poster QR...
            </div>
          )}
        </div>
        <div className="text-black space-y-0.5">
          <p className="text-xs font-black uppercase tracking-wider">Penthouse Drift Track Arrival</p>
          <p className="text-[11px] font-bold opacity-80 truncate">{targetUrl}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 max-w-xs mx-auto pt-1">
        <button
          onClick={handlePrint}
          className="flex-1 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 p-2.5 text-xs font-extrabold transition-colors shadow-xs"
        >
          🖨️ Print Track Poster
        </button>
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download="PenthouseDrift-TrackCheckIn-Poster.png"
            className="flex-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-300 border border-amber-500/40 p-2.5 text-xs font-extrabold transition-colors text-center"
          >
            ⬇️ Download PNG
          </a>
        )}
      </div>
    </div>
  );
}
