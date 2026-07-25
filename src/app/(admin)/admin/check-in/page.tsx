import Link from "next/link";
import { getActiveRentals } from "@/actions/admin/rentals";
import { QRScanner } from "@/components/admin/QRScanner";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const activeRentals = await getActiveRentals();

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
          >
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">Daily Track Check-In</h1>
        </div>
      </div>
      <ActiveRentalsWidget initialRentals={activeRentals} />
      <QRScanner />
    </div>
  );
}
