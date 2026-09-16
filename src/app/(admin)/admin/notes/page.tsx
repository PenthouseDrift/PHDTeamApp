import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getNotes } from "@/actions/admin/notes";
import { NotesManager } from "@/components/admin/NotesManager";

export const dynamic = "force-dynamic";

export default async function AdminNotesPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
    redirect("/admin");
  }

  const notes = await getNotes();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              📝
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                Notes
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Keep track of anything — reminders, to-dos, and info for the team
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-green-500 transition-colors bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 self-start"
          >
            ← Admin Home
          </Link>
        </div>

        <NotesManager initialNotes={notes} />
      </div>
    </div>
  );
}
