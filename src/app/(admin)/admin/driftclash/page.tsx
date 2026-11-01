import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { countNewRegistrations } from "@/lib/driftclash-registrations";

export const dynamic = "force-dynamic";

const SETTINGS: Array<{ href: string; title: string; desc: string; icon: string }> = [
  {
    href: "/admin/driftclash/registrations",
    title: "Registrations",
    desc: "Clubs, drivers and cars sent in from the DriftClash sign up site",
    icon: "📝",
  },
  {
    href: "/admin/driftclash/packs",
    title: "Card packs",
    desc: "What each pack can pull, custom styles and set cards per rarity, odds, and new packs",
    icon: "🎴",
  },
  {
    href: "/admin/card-maker",
    title: "Card maker",
    desc: "Design full art cards, with frame colours and effects",
    icon: "🃏",
  },
  {
    href: "/admin/card-maker?tab=clash-cards",
    title: "Clash game cards",
    desc: "Crew, Debuff and UK Track cards",
    icon: "⚡",
  },
  {
    href: "/admin/challenges",
    title: "Clash challenges",
    desc: "Tandem Clash cups, rarity restrictions and rewards",
    icon: "🏆",
  },
  {
    href: "/admin/member-cards",
    title: "Member cards",
    desc: "Every card members have opened",
    icon: "📚",
  },
];

export default async function DriftClashAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  let newRegistrations = 0;
  try {
    newRegistrations = await countNewRegistrations();
  } catch (error) {
    console.error("[driftclash] registration count failed:", error);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link
          data-page-back
          href="/admin/more"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to More
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">DriftClash</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Everything for the card game, in one place.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SETTINGS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex h-full items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-amber-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span aria-hidden="true" className="text-2xl">
                {item.icon}
              </span>
              <span>
                <span className="flex items-center gap-2 text-base font-black text-zinc-900 dark:text-zinc-100">
                  {item.title}
                  {item.href === "/admin/driftclash/registrations" && newRegistrations > 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-black">
                      {newRegistrations} new
                    </span>
                  )}
                </span>
                <span className="block text-sm text-zinc-500 dark:text-zinc-400">{item.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
