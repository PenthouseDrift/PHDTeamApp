import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProducts } from "@/actions/shop";
import { ShopAdminClient } from "./ShopAdminClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminShopPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard");
  }

  // Fetch all products (including inactive)
  const products = await getProducts(false);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>←</span> Admin
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Shop Inventory</h1>
          </div>
        </div>

        <ShopAdminClient initialProducts={products} />
      </div>
    </div>
  );
}
