"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleImpersonation, toggleForceSelfCheckIn } from "@/actions/dev";

interface DevToolsPanelProps {
  /** Whether the admin is currently impersonating a member. */
  isImpersonating: boolean;
  /** The viewer's real (non-impersonated) role. */
  realRole: string;
  /** Whether the dev "force self check-in" override is active. */
  forceSelfCheckin: boolean;
}

/**
 * Floating developer-tools panel. Renders ONLY in development. A fixed cog
 * button sits at the top-right of the screen; clicking it opens a small panel
 * of local-testing controls (impersonate member, force self check-in).
 */
export function DevToolsPanel({ isImpersonating, realRole, forceSelfCheckin }: DevToolsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (process.env.NODE_ENV !== "development") return null;

  // Only admins/mods can impersonate; the force-checkin control is useful to
  // any dev session, so the panel always shows in development.
  const canImpersonate = isImpersonating || realRole === "admin" || realRole === "moderator";

  const handleToggleImpersonation = () => {
    startTransition(async () => {
      await toggleImpersonation(!isImpersonating);
      router.refresh();
    });
  };

  const handleToggleForceCheckin = () => {
    startTransition(async () => {
      await toggleForceSelfCheckIn(!forceSelfCheckin);
      router.refresh();
    });
  };

  return (
    <div className="fixed right-3 z-[9999]" style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}>
      {/* Cog button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Developer tools"
        aria-expanded={open}
        className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors ${
          isImpersonating || forceSelfCheckin
            ? "border-amber-500/50 bg-amber-500/90 text-black"
            : "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
        }`}
      >
        <svg
          className={`h-5 w-5 ${isPending ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Dev Controls
            </p>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
              Local only
            </span>
          </div>

          <div className="space-y-1">
            {canImpersonate && (
              <DevToggleRow
                label="Impersonate Member"
                description="View the app as a regular member"
                active={isImpersonating}
                disabled={isPending}
                onToggle={handleToggleImpersonation}
              />
            )}

            <DevToggleRow
              label="Force Self Check-In"
              description="Open self check-in regardless of event times"
              active={forceSelfCheckin}
              disabled={isPending}
              onToggle={handleToggleForceCheckin}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DevToggleRow({
  label,
  description,
  active,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={active}
      className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="block text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          active ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
