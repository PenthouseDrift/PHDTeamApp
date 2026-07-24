"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { checkInWithDayPass, checkInWithRental } from "@/actions/admin/checkins";

interface ScanResult {
  status: "active" | "expired" | "duplicate" | "invalid" | "error";
  member?: {
    id: string;
    name: string;
    image: string | null;
    membershipStatus: "active" | "expired";
    dayPasses: number;
    rentalHours: number;
  };
  message: string;
}

export function QRScanner() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string>("");
  const [manualInput, setManualInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const handleScan = useCallback(async (decodedText: string) => {
    stopCamera();

    let memberId: string | null = null;

    try {
      const parsed = JSON.parse(decodedText);
      memberId = parsed.memberId ?? null;
    } catch {
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
        body: JSON.stringify({ memberId: decodedText }),
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
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not supported in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);

      // Start continuous scanning using native BarcodeDetector or html5-qrcode
      const { Html5Qrcode } = await import("html5-qrcode");

      let html5QrCodeInstance: InstanceType<typeof Html5Qrcode> | null = null;
      let tempDivId = "temp-qr-scanner";

      // If BarcodeDetector is not natively supported, fallback to Html5Qrcode instance
      if (typeof window !== "undefined" && !("BarcodeDetector" in window)) {
        let tempDiv = document.getElementById(tempDivId);
        if (!tempDiv) {
          tempDiv = document.createElement("div");
          tempDiv.id = tempDivId;
          tempDiv.style.display = "none";
          document.body.appendChild(tempDiv);
        }
        html5QrCodeInstance = new Html5Qrcode(tempDivId);
      }

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;

        // 1. Try Native Browser BarcodeDetector (iOS Safari 17+, Chrome Android)
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              handleScan(codes[0].rawValue);
              return;
            }
          } catch {
            /* continue */
          }
        }

        // 2. Fallback to Canvas snapshot + Html5Qrcode
        if (html5QrCodeInstance && videoRef.current) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(async (blob) => {
                if (blob && html5QrCodeInstance) {
                  try {
                    const file = new File([blob], "frame.png", { type: "image/png" });
                    const decoded = await html5QrCodeInstance.scanFile(file, false);
                    if (decoded) {
                      handleScan(decoded);
                    }
                  } catch {
                    /* frame scanning noise */
                  }
                }
              }, "image/png");
            }
          } catch {
            /* ignore */
          }
        }
      }, 300);
    } catch (err) {
      console.error("Camera access error:", err);
      const message = err instanceof Error ? err.message : "Failed to access camera";
      if (message.includes("NotAllowedError") || message.includes("Permission")) {
        setCameraError(
          "Camera access denied. Please grant camera permission in your browser settings and reload."
        );
      } else {
        setCameraError(message);
      }
    }
  }, [handleScan, stopCamera]);

  // File upload scan handler
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      let tempDiv = document.getElementById("temp-qr-file");
      if (!tempDiv) {
        tempDiv = document.createElement("div");
        tempDiv.id = "temp-qr-file";
        tempDiv.style.display = "none";
        document.body.appendChild(tempDiv);
      }
      const instance = new Html5Qrcode("temp-qr-file");
      const decoded = await instance.scanFile(file, true);
      if (decoded) {
        handleScan(decoded);
      }
    } catch {
      alert("Could not detect a valid QR code in that image. Please try another picture.");
    }
  }

  // Auto-dismiss result overlay after 15 seconds
  useEffect(() => {
    if (result) {
      dismissTimerRef.current = setTimeout(() => {
        setResult(null);
        startCamera();
      }, 15000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [result, startCamera]);

  // Start camera on component mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleActionComplete(message: string) {
    setResult((prev) => (prev ? { ...prev, status: "active", message } : null));
  }

  // Result overlay
  if (result) {
    const isMembershipActive = result.member?.membershipStatus === "active";
    const dayPasses = result.member?.dayPasses || 0;
    const rentalHours = result.member?.rentalHours || 0;

    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto ${getResultBackground(result.status)}`}
      >
        <div className="text-center space-y-4 max-w-md w-full my-auto">
          {/* Member Name & Image */}
          {result.member && (
            <div className="flex flex-col items-center gap-2">
              {result.member.image ? (
                <img
                  src={result.member.image}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover ring-4 ring-white/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 text-white font-bold text-xl flex items-center justify-center ring-4 ring-white/30">
                  {result.member.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <h2 className="text-2xl font-black text-white">{result.member.name}</h2>
            </div>
          )}

          {/* Membership Status Badge */}
          {result.member && (
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-md ${
                  isMembershipActive
                    ? "bg-green-500 text-white ring-2 ring-green-300"
                    : "bg-red-600 text-white ring-2 ring-red-300"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isMembershipActive ? "bg-green-200 animate-ping" : "bg-red-200"}`} />
                {isMembershipActive ? "Active 28-Day Membership" : "Membership Expired / None"}
              </span>
            </div>
          )}

          {/* Wallet Balances Summary */}
          {result.member && (
            <div className="flex justify-center gap-4 py-1">
              <div className="bg-black/30 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-white/20">
                <p className="text-[10px] text-zinc-200 uppercase font-semibold">Day Passes</p>
                <p className="text-lg font-black text-white">{dayPasses}</p>
              </div>
              <div className="bg-black/30 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-white/20">
                <p className="text-[10px] text-zinc-200 uppercase font-semibold">Rental Hours</p>
                <p className="text-lg font-black text-white">{rentalHours}</p>
              </div>
            </div>
          )}

          <p className="text-xl font-bold text-white leading-tight">{result.message}</p>
          <StatusIcon status={result.status} />

          {/* Manual Action Buttons */}
          {result.member && (
            <div className="space-y-2 pt-2 text-left">
              <p className="text-xs font-bold text-white/80 uppercase tracking-wider text-center">
                Manual Check-In Options
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Use Wallet Day Pass */}
                {dayPasses > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (!result.member) return;
                      startTransition(async () => {
                        const res = await checkInWithDayPass(result.member!.id, result.member!.name, "admin", false);
                        if (res.success) {
                          handleActionComplete(`Day Pass Used! (${dayPasses - 1} left)`);
                        }
                      });
                    }}
                    className="w-full py-2.5 px-3 rounded-lg bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors shadow-md disabled:opacity-50 text-center"
                  >
                    🎫 Use Day Pass ({dayPasses} left)
                  </button>
                )}

                {/* Day Pass - Paid Cash/Card */}
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!result.member) return;
                    startTransition(async () => {
                      const res = await checkInWithDayPass(result.member!.id, result.member!.name, "admin", true);
                      if (res.success) {
                        handleActionComplete("Day Pass — Paid in Person (£10)");
                      }
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-lg bg-white/90 text-zinc-900 text-xs font-extrabold hover:bg-white transition-colors shadow-md disabled:opacity-50 text-center"
                >
                  💵 Day Pass (£10 Paid Cash/Card)
                </button>

                {/* Use Wallet Rental */}
                {rentalHours > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (!result.member) return;
                      startTransition(async () => {
                        const res = await checkInWithRental(result.member!.id, result.member!.name, "admin", false);
                        if (res.success) {
                          handleActionComplete(`Car Rental Started! (${rentalHours - 1} hrs left)`);
                        }
                      });
                    }}
                    className="w-full py-2.5 px-3 rounded-lg bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors shadow-md disabled:opacity-50 text-center"
                  >
                    🏎️ Use Rental Hour ({rentalHours} left)
                  </button>
                )}

                {/* Rental - Paid Cash/Card */}
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!result.member) return;
                    startTransition(async () => {
                      const res = await checkInWithRental(result.member!.id, result.member!.name, "admin", true);
                      if (res.success) {
                        handleActionComplete("Car Rental — Paid in Person (£10)");
                      }
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-lg bg-white/90 text-zinc-900 text-xs font-extrabold hover:bg-white transition-colors shadow-md disabled:opacity-50 text-center"
                >
                  🏎️ Car Rental (£10 Paid Cash/Card)
                </button>
              </div>

              {/* Standard Admin Override */}
              {!isMembershipActive && (
                <button
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/checkin/scan", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ memberId: lastScannedId, override: true }),
                      });
                      if (res.ok) {
                        handleActionComplete("Override — Checked In");
                      }
                    } catch { /* ignore */ }
                  }}
                  className="w-full py-2 px-3 bg-black/40 text-white text-xs font-bold rounded-lg transition-colors hover:bg-black/60 border border-white/20 text-center mt-1"
                >
                  ⚡ Quick Override (Check In Anyway)
                </button>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => {
                setResult(null);
                startCamera();
              }}
              className="px-6 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-lg transition-colors"
            >
              Scan Next Member
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Scan Member QR Code</h1>

      {/* Pure HTML5 Video Element */}
      <div className="w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-black border border-zinc-200 dark:border-zinc-800 shadow-xl relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Viewfinder Target Box Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-2 border-amber-500/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] relative">
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />
          </div>
        </div>

        {!isScanning && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 p-4 text-center">
            <p className="text-xs font-semibold text-zinc-300 mb-3">Camera initializing...</p>
            <button
              onClick={startCamera}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl shadow-lg transition-colors"
            >
              📷 Start Camera
            </button>
          </div>
        )}
      </div>

      {/* Camera Controls & Status */}
      <div className="w-full max-w-md mt-4 flex items-center justify-between gap-2">
        <button
          onClick={startCamera}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        >
          📷 Tap to Start / Enable Camera
        </button>

        {/* Snap / Select QR Image file fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-200 transition-colors"
        >
          🖼️ Snap Photo of QR
        </button>
      </div>

      {cameraError && (
        <div className="w-full max-w-md mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-center">
          <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{cameraError}</p>
        </div>
      )}

      {/* Manual Check-In Code Input Fallback */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manualInput.trim()) {
            handleScan(manualInput.trim());
            setManualInput("");
          }
        }}
        className="w-full max-w-md mt-5 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm text-left"
      >
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          Manual Check-In (ID, Name, Nickname or Email)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter member ID, name, nickname, or email..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl transition-colors shadow-sm"
          >
            Check In
          </button>
        </div>
      </form>
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
        className="w-16 h-16 mx-auto text-white"
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
        className="w-16 h-16 mx-auto text-white"
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
      className="w-16 h-16 mx-auto text-white"
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
