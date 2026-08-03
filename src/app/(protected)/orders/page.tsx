import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserOrders } from "@/actions/orders";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const orders = await getUserOrders(session.user.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">My Orders</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {orders.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-sm">
            <span className="text-4xl mb-4 block">🧾</span>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No Orders Yet</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2">
              Purchases you make in the app (Store items, Memberships, Passes) will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const orderDate = new Date(order.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div key={order.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2 justify-between items-center">
                    <div>
                      <p className="text-xs text-zinc-500 font-semibold mb-0.5">Order Placed</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{orderDate}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 font-semibold mb-0.5">Order ID</p>
                      <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">#{order.id.slice(0, 8)}</p>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col md:flex-row gap-6 justify-between">
                    <div className="flex-1 space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold w-6 h-6 rounded flex items-center justify-center shrink-0">
                              {item.quantity}x
                            </span>
                            <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.name}</span>
                          </div>
                          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                            £{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="md:w-48 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-zinc-100 dark:border-zinc-800 md:pl-6 flex flex-col justify-center">
                      <div className="flex justify-between items-center md:flex-col md:items-start mb-2">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Total</span>
                        <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                          £{order.totalAmount.toFixed(2)}
                        </span>
                      </div>
                      
                      {order.type === "shop" && (
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            order.status === "collected"
                              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              : order.status === "ready_for_collection"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 animate-pulse"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                          }`}>
                            {order.status === "collected" ? "Collected" : order.status === "ready_for_collection" ? "Ready for Collection" : "Processing"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
