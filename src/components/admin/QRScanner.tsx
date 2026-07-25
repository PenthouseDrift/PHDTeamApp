"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  checkInWithDayPass,
  checkInWithRental,
  checkInFriendWithPass,
  addNonMemberCheckIn,
} from "@/actions/admin/checkins";
import { activateMembershipInPerson } from "@/actions/membership";

interface ScanResult {
  status: "active" | "expired" | "duplicate" | "invalid" | "error";
  scanType?: "membership" | "day_pass" | "rental";
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
  const pathname = usePathname();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string>("");
  const [manualInput, setManualInput] = useState("");
  const [friendNameInput, setFriendNameInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Async session & mounting guards to prevent lingering camera hardware access
  const isMountedRef = useRef(true);
  const currentSessionIdRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrCodeRef = useRef<any>(null);

  const stopCamera = useCallback(() => {
    currentSessionIdRef.current = 0;

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.clear();
      } catch { /* ignore */ }
      html5QrCodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      if (videoRef.current.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      }
      videoRef.current.pause();
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
        scanType: data.scanType,
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

    const sessionId = Date.now();
    currentSessionIdRef.current = sessionId;

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

      if (!isMountedRef.current || currentSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        return;
      }

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if (!isMountedRef.current || currentSessionIdRef.current !== sessionId) {
        stopCamera();
        return;
      }

      setIsScanning(true);

      const { Html5Qrcode } = await import("html5-qrcode");
      let tempDivId = "temp-qr-scanner";

      if (typeof window !== "undefined" && !("BarcodeDetector" in window)) {
        let tempDiv = document.getElementById(tempDivId);
        if (!tempDiv) {
          tempDiv = document.createElement("div");
          tempDiv.id = tempDivId;
          tempDiv.style.display = "none";
          document.body.appendChild(tempDiv);
        }
        html5QrCodeRef.current = new Html5Qrcode(tempDivId);
      }

      scanIntervalRef.current = setInterval(async () => {
        if (!isMountedRef.current || currentSessionIdRef.current !== sessionId) {
          stopCamera();
          return;
        }

        if (!videoRef.current || videoRef.current.readyState < 2) return;

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

        if (html5QrCodeRef.current && videoRef.current) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(async (blob) => {
                if (blob && html5QrCodeRef.current) {
                  try {
                    const file = new File([blob], "frame.png", { type: "image/png" });
                    const decoded = await html5QrCodeRef.current.scanFile(file, false);
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
      if (!isMountedRef.current || currentSessionIdRef.current !== sessionId) return;

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

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    const handleVisibilityChange = () => {
      if (document.hidden) stopCamera();
    };

    const handlePageHide = () => stopCamera();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [pathname, stopCamera]);

  // Auto-dismiss result overlay after 20 seconds
  useEffect(() => {
    if (result) {
      dismissTimerRef.current = setTimeout(() => {
        setResult(null);
        startCamera();
      }, 20000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [result, startCamera]);

  function handleActionComplete(message: string) {
    setResult((prev) => (prev ? { ...prev, status: "active", message } : null));
  }

  function handleCheckInFriendPass(passType: "day_pass" | "rental") {
    if (!result?.member) return;
    const memberId = result.member.id;
    const memberName = result.member.name;
    const currentDayPasses = result.member.dayPasses;
    const currentRentalHours = result.member.rentalHours;

    startTransition(async () => {
      const res = await checkInFriendWithPass(
        memberId,
        memberName,
        friendNameInput,
        passType,
        "admin"
      );
      if (res.success) {
        setFriendNameInput("");
        const newDayPasses = passType === "day_pass" ? res.data.remaining : currentDayPasses;
        const newRentalHours = passType === "rental" ? res.data.remaining : currentRentalHours;
        setResult((prev) =>
          prev
            ? {
                ...prev,
                status: "active",
                message: res.data.message,
                member: prev.member
                  ? {
                      ...prev.member,
                      dayPasses: newDayPasses,
                      rentalHours: newRentalHours,
                    }
                  : undefined,
              }
            : null
        );
      }
    });
  }

  function handleCheckInFriendCash(passType: "day_pass" | "rental") {
    if (!result?.member) return;
    const memberName = result.member.name;
    const cleanFriendName = friendNameInput.trim() || `Guest of ${memberName}`;

    startTransition(async () => {
      const res = await addNonMemberCheckIn(cleanFriendName, "admin", passType);
      if (res.success) {
        setFriendNameInput("");
        const msg = passType === "day_pass"
          ? `Guest ${cleanFriendName} checked in (Paid £10 Day Pass Cash/Card)`
          : `Guest ${cleanFriendName} checked in & Car Rental Started (Paid £10 Cash/Card)`;
        handleActionComplete(msg);
      }
    });
  }

  // Result overlay
  if (result) {
    const isMembershipActive = result.member?.membershipStatus === "active";
    const dayPasses = result.member?.dayPasses || 0;
    const rentalHours = result.member?.rentalHours || 0;
    const isDuplicate = result.status === "duplicate";
    const isExpired = result.status === "expired";

    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto ${getResultBackground(result.status)}`}
      >
        <div className="text-center space-y-4 max-w-md w-full my-auto">
          {/* Member Profile Avatar & Name */}
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

          {/* Membership Badge */}
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

          {/* ----------------------------------------------------------------- */}
          {/* OPTION SET 1: Non-Member / Expired Membership Controls */}
          {/* ----------------------------------------------------------------- */}
          {result.member && isExpired && (
            <div className="space-y-3 pt-2 text-left">
              <p className="text-xs font-bold text-white/80 uppercase tracking-wider text-center">
                Member Check-In Options (Non-Member / Expired)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Activate 28-Day Membership In-Person */}
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!result.member) return;
                    startTransition(async () => {
                      const res = await activateMembershipInPerson(result.member!.id, result.member!.name, "admin");
                      if (res.success) {
                        handleActionComplete(res.data.message);
                      }
                    });
                  }}
                  className="w-full py-3 px-3 rounded-xl bg-green-500 hover:bg-green-400 text-white text-xs font-black transition-colors shadow-lg disabled:opacity-50 text-center col-span-1 sm:col-span-2 border border-green-300/40"
                >
                  💳 Activate 28-Day Membership (£40 Paid Cash/Card) &amp; Check In
                </button>
                {/* Check in using member's wallet pass */}
                {dayPasses > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (!result.member) return;
                      startTransition(async () => {
                        const res = await checkInWithDayPass(result.member!.id, result.member!.name, "admin", false);
                        if (res.success) {
                          handleActionComplete(`Checked In with Wallet Day Pass! (${dayPasses - 1} left)`);
                        }
                      });
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors shadow-md disabled:opacity-50 text-center"
                  >
                    🎫 Check In with Day Pass ({dayPasses} left)
                  </button>
                )}

                {/* Check in using member's wallet rental */}
                {rentalHours > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (!result.member) return;
                      startTransition(async () => {
                        const res = await checkInWithRental(result.member!.id, result.member!.name, "admin", false);
                        if (res.success) {
                          handleActionComplete(`Checked In & Car Rental Started! (${rentalHours - 1} hrs left)`);
                        }
                      });
                    }}
                    className="w-full py-2.5 px-3 rounded-lg bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors shadow-md disabled:opacity-50 text-center"
                  >
                    🏎️ Check In with Rental Hour ({rentalHours} left)
                  </button>
                )}

                {/* Pay £10 Cash/Card for Day Pass */}
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!result.member) return;
                    startTransition(async () => {
                      const res = await checkInWithDayPass(result.member!.id, result.member!.name, "admin", true);
                      if (res.success) {
                        handleActionComplete("Checked In — Day Pass Paid (£10 Cash/Card)");
                      }
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/90 text-zinc-900 text-xs font-extrabold hover:bg-white transition-colors shadow-md disabled:opacity-50 text-center"
                >
                  💵 Day Pass (£10 Paid Cash/Card)
                </button>

                {/* Pay £10 Cash/Card for Car Rental */}
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (!result.member) return;
                    startTransition(async () => {
                      const res = await checkInWithRental(result.member!.id, result.member!.name, "admin", true);
                      if (res.success) {
                        handleActionComplete("Car Rental Started — Paid (£10 Cash/Card)");
                      }
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/90 text-zinc-900 text-xs font-extrabold hover:bg-white transition-colors shadow-md disabled:opacity-50 text-center"
                >
                  🏎️ Car Rental (£10 Paid Cash/Card)
                </button>
              </div>

              {/* Standard Admin Quick Override */}
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
                      handleActionComplete("Override — Member Checked In");
                    }
                  } catch { /* ignore */ }
                }}
                className="w-full py-2 px-3 bg-black/40 text-white text-xs font-bold rounded-lg transition-colors hover:bg-black/60 border border-white/20 text-center mt-1"
              >
                ⚡ Quick Override (Check In Anyway)
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* OPTION SET 2: Friend / Guest Check-In Controls (Available on Duplicate or Active scans) */}
          {/* ----------------------------------------------------------------- */}
          {result.member && (isDuplicate || isMembershipActive) && (
            <div className="bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/25 space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  👥 Check In a Friend / Guest
                </span>
                <span className="text-[10px] text-white/70">
                  Via {result.member.name.split(" ")[0]}&apos;s passes or cash
                </span>
              </div>

              <input
                type="text"
                placeholder="Enter friend's name (optional)..."
                value={friendNameInput}
                onChange={(e) => setFriendNameInput(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/30 px-3 py-2 text-xs font-bold text-white placeholder-white/50 focus:outline-none focus:border-amber-400"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dayPasses > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => handleCheckInFriendPass("day_pass")}
                    className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black transition-all shadow-sm disabled:opacity-50 text-center"
                  >
                    🎫 Use Wallet Day Pass ({dayPasses} left)
                  </button>
                )}

                {rentalHours > 0 && (
                  <button
                    disabled={isPending}
                    onClick={() => handleCheckInFriendPass("rental")}
                    className="w-full py-2.5 px-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-[11px] font-black transition-all shadow-sm disabled:opacity-50 text-center"
                  >
                    🏎️ Use Wallet Rental Hr ({rentalHours} left)
                  </button>
                )}

                <button
                  disabled={isPending}
                  onClick={() => handleCheckInFriendCash("day_pass")}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/90 hover:bg-white text-zinc-900 text-[11px] font-black transition-all shadow-sm disabled:opacity-50 text-center"
                >
                  💵 Pay Friend Day Pass (£10 Cash)
                </button>

                <button
                  disabled={isPending}
                  onClick={() => handleCheckInFriendCash("rental")}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/90 hover:bg-white text-zinc-900 text-[11px] font-black transition-all shadow-sm disabled:opacity-50 text-center"
                >
                  🏎️ Pay Friend Car Rental (£10 Cash)
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => {
                setResult(null);
                startCamera();
              }}
              className="px-6 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-colors"
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
