import { getActiveRentals } from "@/actions/admin/rentals";
import { QRScanner } from "@/components/admin/QRScanner";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const activeRentals = await getActiveRentals();

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <ActiveRentalsWidget initialRentals={activeRentals} />
      <QRScanner />
    </div>
  );
}
