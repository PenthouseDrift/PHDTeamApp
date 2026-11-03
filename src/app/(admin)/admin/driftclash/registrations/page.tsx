import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasUpdatesSinceReview, listRegistrations } from "@/lib/driftclash-registrations";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function DriftClashRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const { show } = await searchParams;
  const onlyNew = show === "new";

  const all = await listRegistrations();
  const newCount = all.filter((r) => r.status === "new").length;
  const rows = onlyNew ? all.filter((r) => r.status === "new") : all;

  const tab = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
      active
        ? "bg-amber-500 text-black"
        : "border border-zinc-200 bg-white text-zinc-600 hover:border-amber-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
    }`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link
          data-page-back
          href="/admin/driftclash"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to DriftClash
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Registrations</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Clubs, drivers and cars sent in from the DriftClash sign up site.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter registrations" className="flex gap-2">
          <Link href="/admin/driftclash/registrations" className={tab(!onlyNew)} aria-current={!onlyNew ? "page" : undefined}>
            All ({all.length})
          </Link>
          <Link
            href="/admin/driftclash/registrations?show=new"
            className={tab(onlyNew)}
            aria-current={onlyNew ? "page" : undefined}
          >
            New ({newCount})
          </Link>
        </nav>
        {all.length > 0 && (
          // A file download, not a page, so a plain link is right here.
          <a
            href="/admin/driftclash/registrations/export"
            download
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:border-amber-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Download CSV
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {all.length === 0 ? "Nobody has registered yet." : "Nothing new. Everyone has been looked at."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const photo = r.googleImage;
            const updated = hasUpdatesSinceReview(r);
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/driftclash/registrations/${encodeURIComponent(r.id)}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors hover:border-amber-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl dark:bg-zinc-800"
                    >
                      🏎️
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                        {r.driver.driverName}
                        {r.driver.nickname ? ` "${r.driver.nickname}"` : ""}
                      </span>
                      {r.source === "guest" && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                          No sign-up
                        </span>
                      )}
                      {r.status === "new" && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-black">New</span>
                      )}
                      {updated && (
                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-sky-600 dark:text-sky-300">
                          Updated
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {r.club.inClub && r.club.name ? r.club.name : "No club"} · {r.club.country ? `${r.club.country} · ` : ""}{r.cars.length}{" "}
                      {r.cars.length === 1 ? "car" : "cars"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-zinc-400">{dateFmt.format(new Date(r.createdAt))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
