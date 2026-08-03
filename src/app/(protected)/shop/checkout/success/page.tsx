import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { updateOrderStatus } from "@/actions/orders";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ShopCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const orderId = searchParams.orderId as string | undefined;
  const status = searchParams["smp-status"] as string | undefined;

  if (orderId && status === "success") {
    // Ideally we should verify with SumUp API, but for now we mark it paid
    await updateOrderStatus(orderId, "paid");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-20 px-4">
      <div className="max-w-md mx-auto text-center space-y-6 animate-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full mx-auto flex items-center justify-center">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-zinc-900 dark:text-zinc-100">Order Confirmed!</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">
            Your payment was successful. The items are now being prepared for Click & Collect.
          </p>
        </div>

        <div className="pt-8 flex flex-col gap-3">
          <Link
            href="/orders"
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black font-bold py-3 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            View My Orders
          </Link>
          <Link
            href="/shop"
            className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
          >
            Back to Shop
          </Link>
        </div>
      </div>
    </div>
  );
}
