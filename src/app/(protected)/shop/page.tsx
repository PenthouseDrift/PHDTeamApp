import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProducts } from "@/actions/shop";
import { ShopClient } from "./ShopClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  // Only admins can see this for now
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const products = await getProducts(true); // Active only

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
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Click & Collect Store</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        
        {/* Banner for Visualizer */}
        <Link 
          href="/shop/visualizer" 
          className="block w-full bg-gradient-to-r from-zinc-900 to-black border border-amber-500/30 hover:border-amber-500/70 transition-all rounded-2xl p-6 shadow-lg group overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
            <svg className="w-32 h-32 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3" fill="black"></circle><path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12M4.9 4.9L7.7 7.7M16.3 16.3L19.1 19.1M4.9 19.1L7.7 16.3M16.3 7.7L19.1 4.9" stroke="black" strokeWidth="2"></path></svg>
          </div>
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-500 text-[10px] font-black tracking-wider uppercase rounded-full mb-3 border border-amber-500/20">New Feature</span>
            <h2 className="text-2xl font-black text-white mb-2">RC Wheel Visualizer</h2>
            <p className="text-zinc-400 text-sm mb-4 max-w-sm">Upload a photo of your RC car and try on the entire AsboRC wheel collection in real-time.</p>
            <div className="inline-flex items-center text-sm font-bold text-amber-500 group-hover:translate-x-1 transition-transform">
              Launch Visualizer <span className="ml-2">→</span>
            </div>
          </div>
        </Link>

        <ShopClient products={products} userId={session.user.id} />
      </div>
    </div>
  );
}
