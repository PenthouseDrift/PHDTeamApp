import type { ReactNode } from "react";

/** A section that opens and closes with a full-width, thumb-sized header row. Keeps long content out of the way on a phone. */
export function Disclosure({ title, hint, defaultOpen = false, children }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-black uppercase tracking-wide text-zinc-200">{title}</span>
          {hint && <span className="block truncate text-[11px] text-zinc-400">{hint}</span>}
        </span>
        <span aria-hidden className="text-xl text-zinc-400 transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-zinc-800 p-3.5">{children}</div>
    </details>
  );
}
