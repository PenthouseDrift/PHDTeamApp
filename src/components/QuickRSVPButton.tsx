"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { getEventRSVPs, setEventRSVP, type RSVPStatus, type EventRSVPData } from "@/actions/events";

interface QuickRSVPButtonProps {
  eventId: string;
  initialRsvpData?: EventRSVPData;
  className?: string;
}

export function QuickRSVPButton({ eventId, initialRsvpData, className = "" }: QuickRSVPButtonProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isAdminOrMod = session?.user?.role === "admin" || session?.user?.role === "moderator";

  const [status, setStatus] = useState<RSVPStatus | null>(initialRsvpData?.userRSVP || null);
  const [goingCount, setGoingCount] = useState<number>(initialRsvpData?.goingCount || 0);
  const [loading, setLoading] = useState(!initialRsvpData);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialRsvpData) {
      setStatus(initialRsvpData.userRSVP || null);
      setGoingCount(initialRsvpData.goingCount);
      setLoading(false);
      return;
    }
    
    let isMounted = true;
    async function load() {
      if (!eventId) return;
      const data = await getEventRSVPs(eventId, userId);
      if (isMounted) {
        setStatus(data.userRSVP || null);
        setGoingCount(data.goingCount);
        setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [eventId, userId, initialRsvpData]);

  function handleQuickToggle(e: React.MouseEvent) {
    e.stopPropagation(); // Don't trigger parent card click / modal open
    if (!userId || isPending) return;

    // Quick toggle: None -> Going -> Maybe -> Can't Go -> None
    let nextStatus: RSVPStatus | null = null;
    if (status === null) nextStatus = "going";
    else if (status === "going") nextStatus = "maybe";
    else if (status === "maybe") nextStatus = "cant_go";
    else nextStatus = null;

    const prevStatus = status;
    setStatus(nextStatus);

    if (isAdminOrMod) {
      if (prevStatus === "going" && nextStatus !== "going") setGoingCount((c) => Math.max(0, c - 1));
      if (prevStatus !== "going" && nextStatus === "going") setGoingCount((c) => c + 1);
    }

    startTransition(async () => {
      const res = await setEventRSVP(eventId, userId, nextStatus);
      if (res.success && res.data) {
        setStatus(res.data.userRSVP || null);
        setGoingCount(res.data.goingCount);
      }
    });
  }

  if (loading) {
    return (
      <span className="text-[10px] text-zinc-400 font-medium px-2 py-0.5 animate-pulse">
        ...
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleQuickToggle}
      title="Quick RSVP: Tap to cycle (Going → Maybe → Can't Go)"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs hover:scale-105 active:scale-95 border ${
        status === "going"
          ? "bg-emerald-500 text-black border-emerald-400 shadow-emerald-500/20"
          : status === "maybe"
          ? "bg-amber-500 text-black border-amber-400 shadow-amber-500/20"
          : status === "cant_go"
          ? "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400"
          : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:border-amber-500"
      } ${className}`}
    >
      <span>
        {status === "going"
          ? "🏎️ Going"
          : status === "maybe"
          ? "🤔 Maybe"
          : status === "cant_go"
          ? "❌ Can't Go"
          : "🏎️ RSVP"}
      </span>
      {isAdminOrMod && goingCount > 0 && (
        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
          status === "going" ? "bg-black/20 text-black" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
        }`}>
          {goingCount}
        </span>
      )}
    </button>
  );
}
