import { auth } from "@/lib/auth";
import { ListingForm } from "@/components/marketplace/ListingForm";

export const dynamic = "force-dynamic";

export default async function SubmitListingPage() {
  const session = await auth();
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">List an Item</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Post something you&apos;d like to sell to the community
          </p>
        </div>

        <ListingForm mode="create" viewerRole={session?.user?.role} />
      </div>
    </div>
  );
}
