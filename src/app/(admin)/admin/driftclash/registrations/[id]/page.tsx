import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRegistrationById, hasUpdatesSinceReview } from "@/lib/driftclash-registrations";
import { ReviewButton } from "./ReviewButton";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Value({ value }: { value: string }) {
  if (!value) return <span className="text-zinc-400">Not given</span>;
  return <>{value}</>;
}

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</dt>
          <dd className="whitespace-pre-line break-words text-sm text-zinc-900 dark:text-zinc-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Photos({ urls, label, title }: { urls: string[]; label: string; title?: string }) {
  const safe = urls.filter((u) => u.startsWith("https://"));
  if (safe.length === 0) return null;
  return (
    <>
      {title && <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</p>}
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {safe.map((url, i) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${label} ${i + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </a>
        </li>
      ))}
    </ul>
    </>
  );
}

const panel = "space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const heading = "text-base font-black text-zinc-900 dark:text-zinc-100";

export default async function RegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const { id } = await params;
  const r = await getRegistrationById(decodeURIComponent(id));
  if (!r) notFound();

  const updated = hasUpdatesSinceReview(r);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Link
          data-page-back
          href="/admin/driftclash/registrations"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to registrations
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
              {r.driver.driverName}
              {r.driver.nickname ? ` "${r.driver.nickname}"` : ""}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <a href={`mailto:${r.email}`} className="underline">
                {r.email}
              </a>{" "}
              · signed up {dateFmt.format(new Date(r.createdAt))}
              {r.updatedAt > r.createdAt + 1000 ? ` · updated ${dateFmt.format(new Date(r.updatedAt))}` : ""}
            </p>
            <p className="flex flex-wrap gap-2 pt-1 text-[11px] font-black uppercase">
              <span className={`rounded-full px-2 py-0.5 ${r.status === "new" ? "bg-amber-500 text-black" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"}`}>
                {r.status === "new" ? "New" : "Reviewed"}
              </span>
              {updated && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-600 dark:text-sky-300">Edited since review</span>}
            </p>
          </div>
          <ReviewButton id={r.id} reviewed={r.status === "reviewed"} />
        </div>
      </div>

      <section className={panel} aria-labelledby="club-h">
        <h2 id="club-h" className={heading}>Club</h2>
        {!r.club.inClub ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Independent driver, not in a club.</p>
        ) : (
          <>
            {r.club.logo.startsWith("https://") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.club.logo} alt={`${r.club.name} logo`} className="h-24 w-24 rounded-2xl bg-zinc-100 object-contain dark:bg-zinc-800" />
            )}
            <Rows
              rows={[
                ["Club name", <Value key="n" value={r.club.name} />],
                ["Based in", <Value key="l" value={r.club.location} />],
                ["Country", <Value key="co" value={r.club.country} />],
                ["Their role", <Value key="r" value={r.club.role} />],
                ["About the club", <Value key="d" value={r.club.description} />],
              ]}
            />
            <Photos urls={r.club.photos} label="Club photo" />
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="cars-h">
        <h2 id="cars-h" className={heading}>
          Cars ({r.cars.length})
        </h2>
        {r.cars.map((car, i) => (
          <article key={car.id} className={panel} aria-label={`Car ${i + 1}`}>
            <h3 className="text-sm font-black text-amber-600 dark:text-amber-400">
              {car.make} {car.model}
              {car.nickname ? ` · ${car.nickname}` : ""}
            </h3>
            <Photos urls={car.photos} label={`${car.make} ${car.model} photo`} title="Car" />
            <Photos urls={car.chassisPhotos ?? []} label={`${car.make} ${car.model} chassis photo`} title="Chassis" />
            <Rows
              rows={[
                ["Chassis", <Value key="c" value={car.chassis} />],
                ["Body shell", <Value key="d" value={car.bodyShell} />],
                ["Motor", <Value key="f" value={car.motor} />],
                ["ESC", <Value key="g" value={car.esc} />],
                ["Servo", <Value key="h" value={car.servo} />],
                ["Gyro", <Value key="i" value={car.gyro} />],
                ["Tyres", <Value key="j" value={car.tyres} />],
                ["Notes", <Value key="l" value={car.notes} />],
              ]}
            />
          </article>
        ))}
      </section>

      <section className={panel} aria-labelledby="consent-h">
        <h2 id="consent-h" className={heading}>Permission</h2>
        <Rows
          rows={[
            ["OK to use in the game", r.consentGameData ? "Yes" : "No"],
            ["OK to email news", r.consentMarketing ? "Yes" : "No"],
          ]}
        />
      </section>
    </div>
  );
}
