import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveShopOrders } from "@/actions/orders";
import { getProducts } from "@/actions/shop";

export const dynamic = "force-dynamic";

export default async function AdminShopHubPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard");
  }

  const [activeOrders, products] = await Promise.all([
    getActiveShopOrders().catch(() => []),
    getProducts(false).catch(() => []),
  ]);

  const activeProducts = products.filter((p) => p.isActive).length;

  const sections = [
    {
      title: "Orders",
      description: "Fulfil click & collect orders and manage order status",
      href: "/admin/orders",
      icon: "🛍️",
      stat: `${activeOrders.length} active`,
      color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Products",
      description: "Add, edit and manage shop inventory and pricing",
      href: "/admin/shop/products",
      icon: "🏷️",
      stat: `${activeProducts} live · ${products.length} total`,
      color: "border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
  ];

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>←</span> Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Shop</h1>
        </div>

        {/* Section cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-amber-500/50 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl ${s.color}`}>
                {s.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-base font-bold text-zinc-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-500">
                  {s.title}
                </h2>
                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {s.description}
                </p>
                <p className="pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{s.stat}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
