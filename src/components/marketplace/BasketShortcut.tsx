"use client";

import Link from "next/link";
import { useBasket } from "@/components/marketplace/BasketProvider";

/**
 * Marketplace "Basket" shortcut card with a live item-count badge. Mirrors the
 * other shortcut cards on the marketplace page but is a client component so it
 * can read the basket context.
 */
export function BasketShortcut() {
  const { count, total } = useBasket();

  return (
    <Link
      href="/marketplace/basket"
      className="group relative flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 shadow-sm transition-all hover:border-amber-500/70 hover:shadow-md sm:p-4"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xl">
        🛒
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-black shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-amber-700 dark:text-amber-400">Basket</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {count > 0 ? `${count} item${count === 1 ? "" : "s"} · £${total.toFixed(2)}` : "No items yet"}
        </p>
      </div>
    </Link>
  );
}
