import { BasketClient } from "@/components/marketplace/BasketClient";

export const dynamic = "force-dynamic";

export default function BasketPage() {
  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <BasketClient />
      </div>
    </div>
  );
}
