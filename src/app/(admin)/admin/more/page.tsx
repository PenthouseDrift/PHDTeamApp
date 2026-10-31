import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardVersion } from "@/lib/dashboard-pref";

export const dynamic = "force-dynamic";

interface MoreLink {
  href: string;
  title: string;
  desc: string;
  icon: string;
  adminOnly?: boolean;
}

const EVENT_DAY: MoreLink[] = [
  { href: "/marketplace", title: "Marketplace", desc: "Browse items and mark things as sold", icon: "🏷️" },
  { href: "/admin/click-collect", title: "Click & Collect", desc: "Orders waiting for collection", icon: "🛍️", adminOnly: true },
  { href: "/admin/events", title: "Events", desc: "Create and edit track days", icon: "📅" },
  { href: "/admin/notes", title: "Notes", desc: "Staff notes", icon: "📝" },
  { href: "/admin/card-maker", title: "Card maker", desc: "Design and print PHD trading cards", icon: "🃏", adminOnly: true },
  { href: "/admin/member-cards", title: "Member cards", desc: "Every card members have opened", icon: "🎴", adminOnly: true },
  { href: "/admin/challenges", title: "Clash challenges", desc: "Create & manage Tandem Clash cups, rarity restrictions & rewards", icon: "🏆", adminOnly: true },
];

const MANAGE: MoreLink[] = [
  { href: "/admin/notifications", title: "Global alerts", desc: "Send a notice to all members", icon: "📣", adminOnly: true },
  { href: "/admin/showcase-winners", title: "Winners", desc: "Weekly showcase winner", icon: "🏆", adminOnly: true },
  { href: "/admin/facebook", title: "Facebook", desc: "Publish to the page", icon: "📘", adminOnly: true },
  { href: "/admin/gallery", title: "Website gallery", desc: "Photos on the public site", icon: "🖼️", adminOnly: true },
];

function Row({ link }: { link: MoreLink }) {
  return (
    <Link
      href={link.href}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors hover:border-amber-400/60 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl dark:bg-zinc-800" aria-hidden>
        {link.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">{link.title}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{link.desc}</span>
      </span>
      <span className="text-zinc-400" aria-hidden>
        →
      </span>
    </Link>
  );
}

export default async function AdminMorePage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  // This page only exists in the new staff shell; classic users keep their own menu.
  if ((await getDashboardVersion(session.user.id)) !== "new") redirect("/admin");

  const isAdmin = session.user.role === "admin";
  const eventDay = EVENT_DAY.filter((l) => !l.adminOnly || isAdmin);
  const manage = MANAGE.filter((l) => !l.adminOnly || isAdmin);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Around the track</h2>
        {eventDay.map((l) => (
          <Row key={l.href} link={l} />
        ))}
      </section>

      {manage.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Manage</h2>
          {manage.map((l) => (
            <Row key={l.href} link={l} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Your account</h2>
        <Row link={{ href: "/dashboard2", title: "Member app", desc: "Switch to the member view", icon: "🏠" }} />
        <Row link={{ href: "/profile", title: "Profile & settings", desc: "Your details and app preferences", icon: "👤" }} />
      </section>
    </div>
  );
}
