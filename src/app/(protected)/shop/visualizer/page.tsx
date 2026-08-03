import { getAsboRCWheels } from "@/actions/wheels";
import { WheelVisualizer } from "@/components/shop/WheelVisualizer";
import Link from "next/link";
import { PullToRefresh } from "@/components/PullToRefresh";

export const dynamic = "force-dynamic";

export default async function WheelVisualizerPage() {
  const wheels = await getAsboRCWheels();

  return (
    <PullToRefresh>
      <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 md:py-8 space-y-6">
        
        {/* Header */}
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Wheel Visualizer</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Try on wheels from AsboRC</p>
          </div>
          
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-amber-500 transition-colors bg-zinc-200 dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Back to Store
          </Link>
        </div>

        {/* Main App */}
        {wheels.length > 0 ? (
          <WheelVisualizer wheels={wheels} />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center max-w-5xl mx-auto shadow-sm">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-white mb-2">Unable to load wheels</h2>
            <p className="text-zinc-400 text-sm">We couldn't connect to AsboRC right now. Please try again later.</p>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
