"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ScanResult {
  status: "active" | "expired" | "duplicate" | "invalid" | "error";
  member?: { name: string; image: string | null };
  message: string;
}

export function QRScanner() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string>("");
  const scannerRef = useRef<unknown>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const scanner = scannerRef.current as { stop: () => Promise<void>; clear: () => void };
        await scanner.stop();
        scanner.clear();
      } catch {
        // Scanner may already be stopped
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleScan = useCallback(async (decodedText: string) => {
    // Pause scanning while processing
    await stopScanner();

    let memberId: string | null = null;

    try {
      const parsed = JSON.parse(decodedText);
      memberId = parsed.memberId ?? null;
    } catch {
      // If it's not JSON, try using the raw text as memberId
      memberId = decodedText.trim() || null;
    }

    if (!memberId) {
      setResult({
        status: "invalid",
        message: "Invalid QR code format",
      });
      return;
    }

    try {
      setLastScannedId(memberId);
      const response = await fetch("/api/checkin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setResult({
          status: "error",
          message: errorData.error || "Check-in failed",
        });
        return;
      }

      const data = await response.json();
      setResult({
        status: data.status,
        member: data.member,
        message: data.message,
      });
    } catch {
      setResult({
        status: "error",
        message: "Network error - please check your connection",
      });
    }
  }, [stopScanner]);

  const startScanner = useCallback(async () => {
    setCameraError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (!containerRef.current) return;

      const scannerId = "qr-reader";
      // Clean up any existing reader div
      let readerDiv = document.getElementById(scannerId);
      if (readerDiv) {
        readerDiv.innerHTML = "";
      } else {
        readerDiv = document.createElement("div");
        readerDiv.id = scannerId;
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(readerDiv);
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {
          // QR code scan error (no code found) - ignore
        }
      );

      setIsScanning(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access camera";
      if (
        message.includes("NotAllowedError") ||
        message.includes("Permission")
      ) {
        setCameraError(
          "Camera access denied. Please grant camera permission in your browser settings and reload the page."
        );
      } else {
        setCameraError(message);
      }
    }
  }, [handleScan]);

  // Auto-dismiss result after 5 seconds
  useEffect(() => {
    if (result) {
      dismissTimerRef.current = setTimeout(() => {
        setResult(null);
        startScanner();
      }, 15000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [result, startScanner]);

  // Start scanner on mount
  useEffect(() => {
    startScanner();

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Result overlay
  if (result) {
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${getResultBackground(result.status)}`}
      >
        <div className="text-center space-y-4 max-w-md">
          {result.member?.name && (
            <p className="text-2xl font-bold text-zinc-900">{result.member.name}</p>
          )}
          <p className="text-4xl font-black text-zinc-900">{result.message}</p>
          <StatusIcon status={result.status} />
          <p className="text-sm text-white/70 mt-8">
            Returning to scanner in 15 seconds...
          </p>

          {/* Override button for expired members */}
          {result.status === "expired" && result.member && (
            <button
              onClick={async () => {
                // Force check-in override for expired member
                try {
                  const res = await fetch("/api/checkin/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ memberId: lastScannedId, override: true }),
                  });
                  if (res.ok) {
                    setResult({
                      status: "active",
                      member: result.member,
                      message: "Override — Checked In",
                    });
                  }
                } catch { /* ignore */ }
              }}
              className="mt-4 px-6 py-3 bg-white text-red-700 font-semibold rounded-lg transition-colors hover:bg-white/90"
            >
              Override — Check In Anyway
            </button>
          )}

          <button
            onClick={() => {
              setResult(null);
              startScanner();
            }}
            className="mt-4 px-6 py-3 bg-white/20 hover:bg-white/30 text-zinc-900 font-medium rounded-lg transition-colors"
          >
            Scan Next
          </button>
        </div>
      </div>
    );
  }

  // Camera error state
  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mb-2">Camera Access Required</h2>
        <p className="text-zinc-500 mb-6 max-w-sm">{cameraError}</p>
        <button
          onClick={startScanner}
          className="px-6 py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Scanner view
  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-xl font-bold text-zinc-900 mb-4">Scan Member QR Code</h1>
      <div
        ref={containerRef}
        className="w-full max-w-md aspect-square rounded-xl overflow-hidden bg-white border border-zinc-200"
      >
        <div id="qr-reader" className="w-full h-full" />
      </div>
      {isScanning && (
        <p className="text-sm text-zinc-500 mt-4">
          Position the QR code within the frame
        </p>
      )}
    </div>
  );
}

function getResultBackground(status: ScanResult["status"]): string {
  switch (status) {
    case "active":
      return "bg-green-600";
    case "expired":
      return "bg-red-600";
    case "duplicate":
      return "bg-amber-600";
    case "invalid":
      return "bg-red-800";
    case "error":
      return "bg-red-800";
    default:
      return "bg-zinc-100";
  }
}

function StatusIcon({ status }: { status: ScanResult["status"] }) {
  if (status === "active") {
    return (
      <svg
        className="w-24 h-24 mx-auto text-zinc-900"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    );
  }

  if (status === "duplicate") {
    return (
      <svg
        className="w-24 h-24 mx-auto text-zinc-900"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
    );
  }

  return (
    <svg
      className="w-24 h-24 mx-auto text-zinc-900"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
