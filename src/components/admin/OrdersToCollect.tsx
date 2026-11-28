import type { AppOrder } from "@/actions/orders";

/** How many orders to list before "+ N more", and how many item lines to show for one order. */
const MAX_ORDERS = 10;
const MAX_ITEM_LINES = 6;

/**
 * The orders waiting to be handed over, with the items in each one (not just how many there are), so the person at the desk
 * can see what to pick out. Oldest first, which is the order they were placed in.
 */
export function OrdersToCollect({ orders }: { orders: AppOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Awaiting collection</h3>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {orders.slice(0, MAX_ORDERS).map((o) => {
          const items = Array.isArray(o.items) ? o.items : [];
          const count = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
          const ready = o.status === "ready_for_collection";
          return (
            <li key={o.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{o.userName ?? "Member"}</span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    ready
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {ready ? "Ready" : "Processing"}
                </span>
              </div>
              {items.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300" aria-label={`${count} item${count === 1 ? "" : "s"}`}>
                  {items.slice(0, MAX_ITEM_LINES).map((i, n) => (
                    <li key={`${i.productId}-${n}`} className="flex gap-1.5">
                      <span className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{Number(i.quantity) || 1}×</span>
                      <span className="min-w-0 truncate">{i.name}</span>
                    </li>
                  ))}
                  {items.length > MAX_ITEM_LINES && (
                    <li className="text-zinc-500 dark:text-zinc-400">+ {items.length - MAX_ITEM_LINES} more item{items.length - MAX_ITEM_LINES === 1 ? "" : "s"}</li>
                  )}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No items listed</p>
              )}
            </li>
          );
        })}
      </ul>
      {orders.length > MAX_ORDERS && (
        <p className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">+ {orders.length - MAX_ORDERS} more orders on the Click &amp; Collect page</p>
      )}
    </div>
  );
}
