import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StaticTrackQRPoster } from "@/components/admin/StaticTrackQRPoster";

export const dynamic = "force-dynamic";

export default async function AdminDevelopmentPage() {
  const session = await auth();

  // Strictly restricted to admins only (moderators & members cannot access)
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

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
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded-md border border-purple-300 dark:border-purple-800">
              In Development
            </span>
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
              Admin Development Lab
            </h1>
          </div>
        </div>
      </div>

      <StaticTrackQRPoster />
    </div>
  );
}
