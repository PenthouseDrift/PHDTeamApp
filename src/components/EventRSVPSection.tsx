"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  getEventRSVPs,
  setEventRSVP,
  type EventRSVPData,
  type RSVPStatus,
} from "@/actions/events";

interface EventRSVPSectionProps {
  eventId: string;
}

export function EventRSVPSection({ eventId }: EventRSVPSectionProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [rsvpData, setRsvpData] = useState<EventRSVPData>({
    goingCount: 0,
    maybeCount: 0,
    cantGoCount: 0,
    userRSVP: null,
    goingMembers: [],
  });

  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      const data = await getEventRSVPs(eventId, userId);
      if (isMounted) {
        setRsvpData(data);
        setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [eventId, userId]);

  function handleSelectStatus(targetStatus: RSVPStatus) {
    if (!userId) return;

    // Toggle off if clicking current status
    const newStatus = rsvpData.userRSVP === targetStatus ? null : targetStatus;

    // Optimistic UI update
    setRsvpData((prev) => {
      let goingCount = prev.goingCount;
      let maybeCount = prev.maybeCount;
      let cantGoCount = prev.cantGoCount;

      if (prev.userRSVP === "going") goingCount--;
      if (prev.userRSVP === "maybe") maybeCount--;
      if (prev.userRSVP === "cant_go") cantGoCount--;

      if (newStatus === "going") goingCount++;
      if (newStatus === "maybe") maybeCount++;
      if (newStatus === "cant_go") cantGoCount++;

      return {
        ...prev,
        userRSVP: newStatus,
        goingCount: Math.max(0, goingCount),
        maybeCount: Math.max(0, maybeCount),
        cantGoCount: Math.max(0, cantGoCount),
      };
    });

    startTransition(async () => {
      const res = await setEventRSVP(eventId, userId, newStatus);
      if (res.success && res.data) {
        setRsvpData(res.data);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 p-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏁</span>
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            RSVP &amp; Attendees
          </h4>
        </div>
        {loading ? (
          <span className="text-[10px] text-zinc-400">Loading...</span>
        ) : (
          <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
            <span className="text-emerald-600 dark:text-emerald-400">{rsvpData.goingCount} Going</span>
            {rsvpData.maybeCount > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">• {rsvpData.maybeCount} Maybe</span>}
          </div>
        )}
      </div>

      {/* RSVP Action Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleSelectStatus("going")}
          disabled={!userId || isPending}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
            rsvpData.userRSVP === "going"
              ? "bg-emerald-500 text-black border-emerald-400 font-black shadow-md ring-2 ring-emerald-400/40"
              : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50"
          }`}
        >
          <span className="text-sm">🏎️</span>
          <span>Going</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectStatus("maybe")}
          disabled={!userId || isPending}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
            rsvpData.userRSVP === "maybe"
              ? "bg-amber-500 text-black border-amber-400 font-black shadow-md ring-2 ring-amber-400/40"
              : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-amber-500/50"
          }`}
        >
          <span className="text-sm">🤔</span>
          <span>Maybe</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectStatus("cant_go")}
          disabled={!userId || isPending}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
            rsvpData.userRSVP === "cant_go"
              ? "bg-red-500 text-white border-red-400 font-black shadow-md ring-2 ring-red-400/40"
              : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-red-500/50"
          }`}
        >
          <span className="text-sm">❌</span>
          <span>Can&apos;t Go</span>
        </button>
      </div>

      {/* Going Attendees Avatars */}
      {rsvpData.goingMembers.length > 0 && (
        <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-700/60 space-y-1.5">
          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Attending Drivers:
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {rsvpData.goingMembers.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full px-2 py-0.5 shadow-2xs"
              >
                {m.avatar ? (
                  <img src={m.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-[8px] font-black text-black flex items-center justify-center">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
