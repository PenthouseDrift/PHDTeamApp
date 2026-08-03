"use client";

import { useState, useTransition } from "react";
import type { AppOrder } from "@/actions/orders";
import { updateOrderStatus } from "@/actions/orders";

interface OrderFulfillmentClientProps {
  initialOrders: AppOrder[];
}

export function OrderFulfillmentClient({ initialOrders }: OrderFulfillmentClientProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [isPending, startTransition] = useTransition();

  async function handleMarkCollected(orderId: string) {
    if (isPending || !confirm("Mark this order as collected by the user?")) return;

    startTransition(async () => {
      const res = await updateOrderStatus(orderId, "collected");
      if (res.success) {
        // Remove from active list
        setOrders(orders.filter(o => o.id !== orderId));
      } else {
        alert("Failed to update order: " + res.error);
      }
    });
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center shadow-sm">
        <span className="text-4xl mb-4 block">🎉</span>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">All Caught Up!</h3>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">There are no pending click & collect orders right now.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {orders.map((order) => {
        const orderDate = new Date(order.createdAt).toLocaleString();
        
        return (
          <div key={order.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                  Ready for Collection
                </p>
                <h3 className="font-black text-zinc-900 dark:text-zinc-100 text-lg">
                  {order.userName}
                </h3>
              </div>
              <span className="text-[10px] font-medium text-zinc-500 text-right">
                {orderDate}<br/>
                ID: {order.id.slice(0, 8)}
              </span>
            </div>

            <div className="p-4 flex-1">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Items Ordered</p>
              <ul className="space-y-3">
                {order.items.map((item, idx) => (
                  <li key={idx} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/30 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <span className="bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-black w-6 h-6 rounded flex items-center justify-center">
                        {item.quantity}x
                      </span>
                      <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.name}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 pt-0 mt-auto border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase">Total Paid</p>
                <p className="font-black text-lg text-zinc-900 dark:text-zinc-100">£{order.totalAmount.toFixed(2)}</p>
              </div>
              <button
                onClick={() => handleMarkCollected(order.id)}
                disabled={isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                Mark as Collected
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
