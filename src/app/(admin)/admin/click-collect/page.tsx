import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActiveShopOrders } from "@/actions/orders";
import { getReservedListings } from "@/actions/marketplace";
import { getFacilitatedPayoutReport } from "@/actions/phd-facilitated";
import { OrderFulfillmentClient } from "./OrderFulfillmentClient";
import { ReservedListings } from "./ReservedListings";
import { FacilitatedPayoutReportClient } from "@/components/marketplace/FacilitatedPayoutReportClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminClickCollectPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard");
  }

  const [activeOrders, reservedListings, payoutReport] = await Promise.all([
    getActiveShopOrders(),
    getReservedListings(),
    getFacilitatedPayoutReport(),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>←</span> Admin
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Click &amp; Collect</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Marketplace orders paid online and awaiting collection at the track
              </p>
            </div>
          </div>
        </div>

        <ReservedListings listings={reservedListings} />

        <OrderFulfillmentClient initialOrders={activeOrders} />

        {/* Facilitated-by-PHD owner payouts — sold items we owe the original
            owner for, grouped by owner, with mark-as-paid (like the ASBO-RC
            settlement list). Lives here so staff can settle payouts in the same
            place they handle collections. */}
        <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-500/30 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                🤝
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Owner payouts
                </h2>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/70">
                  Facilitated by PHD — what we owe each original owner
                </p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {payoutReport ? (
              <FacilitatedPayoutReportClient report={payoutReport} />
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Unable to load owner payouts.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
