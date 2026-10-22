import Link from "next/link";
import Image from "next/image";
import type { ReservedListingSummary } from "@/actions/marketplace";

interface ReservedListingsProps {
  listings: ReservedListingSummary[];
}

/**
 * Admin-only panel on the Click & Collect page listing every marketplace item
 * that currently has units RESERVED (held for a buyer but not yet sold/paid).
 * Gives staff one place to see both "held, awaiting payment" and (below) "paid,
 * awaiting collection". Reservations are a pure quantity hold and don't record
 * who they're for, so this shows the product, how many units are held, and the
 * remaining buyable stock. Hidden entirely when nothing is reserved.
 */
export function ReservedListings({ listings }: ReservedListingsProps) {
  if (listings.length === 0) return null;

  const totalHeld = listings.reduce((s, l) => s + l.reservedCount, 0);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-500/30 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 border-b border-amber-200 dark:border-amber-500/30">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🔖
          </span>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Reserved items
            </h2>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
              Held for a buyer — not yet sold or paid
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-black text-black">
          {totalHeld} unit{totalHeld === 1 ? "" : "s"} held
        </span>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {listings.map((l) => (
          <li key={l.listingId} className="flex items-center gap-3 px-4 py-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {l.image ? (
                <Image src={l.image} alt={l.title} fill sizes="48px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                  No image
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={`/marketplace/${l.listingId}`}
                className="line-clamp-1 text-sm font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
              >
                {l.title}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {l.reservedCount} reserved
                </span>
                <span>·</span>
                <span>{l.buyable} buyable</span>
                <span>·</span>
                <span>{l.inStock} in stock</span>
                {l.fullyReserved && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    Fully held
                  </span>
                )}
                {(l.soldByPhd || l.soldByAsboRc) && (
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    Sold by PHD
                  </span>
                )}
                {l.facilitatedByPhd && !l.soldByPhd && !l.soldByAsboRc && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    Facilitated by PHD
                  </span>
                )}
              </p>
              {l.variants.length > 0 && (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  {l.variants
                    .map((v) => `${v.name}: ${v.reservedCount} held`)
                    .join(" · ")}
                </p>
              )}
            </div>

            <Link
              href={`/marketplace/${l.listingId}`}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Manage
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
