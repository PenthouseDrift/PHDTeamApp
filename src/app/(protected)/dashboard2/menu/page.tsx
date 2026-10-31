import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { getMemberHash } from "@/lib/dashboard-pref";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { ShellIcon, type ShellIconName } from "@/components/new-shell/shell-icons";
import { ClassicSwitchRow, QrRow, ShareRow, SignOutRow } from "@/components/new-shell/MenuActions";

export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.penthousedrift.com").replace(/\/$/, "");

interface RowProps {
  href: string;
  icon: ShellIconName;
  title: string;
  subtitle: string;
  badge?: string;
  tone?: "default" | "amber" | "teal";
}

function MenuRow({ href, icon, title, subtitle, badge, tone = "default" }: RowProps) {
  const iconTone =
    tone === "amber"
      ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
      : tone === "teal"
      ? "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <ShellIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
      {badge && (
        <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-black">
          {badge}
        </span>
      )}
      <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
        ›
      </span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</h2>
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </section>
  );
}

/**
 * Menu tab for the new experience: a complete index of the app, grouped by
 * area, so every page is reachable from here even when the tab bar only links
 * to a section's top page. Role-specific entries (Staff, ASBO-RC reports) only
 * appear for those roles.
 */
export default async function MenuPage() {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user;
  const isStaff = user.role === "admin" || user.role === "moderator";

  const [memberData, winnerInfo] = await Promise.all([
    getMemberHash(user.id),
    isStaff ? getCurrentWeekWinnerInfo() : Promise.resolve(null),
  ]);

  const nickname = ((memberData?.nickname as string) || "").trim();
  const avatar = (memberData?.customAvatar as string) || user.image || null;
  const displayName = nickname || user.name || "Member";
  const day = new Date().getDay();
  const winnerPending = isStaff && (day === 0 || day === 6) && Boolean(winnerInfo && !winnerInfo.shellId);

  const roleLabel =
    user.role === "admin" ? "Admin" : user.role === "moderator" ? "Moderator" : user.role === "asbo-rc" ? "ASBO-RC partner" : "Member";

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        >
          {avatar ? (
            <Image src={avatar} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-lg font-bold text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">{displayName}</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
            <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {roleLabel}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">Edit</span>
        </Link>

        <Group title="Track">
          <MenuRow href="/dashboard2" icon="home" title="Home & check-in" subtitle="Check in and see what's on" />
          <MenuRow href="/dashboard2/passes" icon="passes" title="Passes" subtitle="Membership, day passes and rental hours" />
          <MenuRow href="/dashboard2/events" icon="events" title="Track events" subtitle="Upcoming sessions and RSVP" />
          <MenuRow href="/dashboard2/guest" icon="guest" title="Check in a guest" subtitle="Bring a friend to the track" />
        </Group>

        <Group title="Garage & Game">
          <MenuRow href="/cards?tab=clash" icon="cards" title="Tandem Clash Arena" subtitle="Play RC card battles, conquer UK venues & win P-Credits" badge="Play" tone="amber" />
          <MenuRow href="/cars" icon="garage" title="My cars" subtitle="Your cars and saved setups" />
          <MenuRow href="/cards" icon="cards" title="My cards & packs" subtitle="Collect cards of your car. Earn credits by checking in" />
          <MenuRow href="/tuning-advisor" icon="tools" title="Tuning advisor" subtitle="Get setup suggestions" />
          <MenuRow href="/calculator" icon="tools" title="Gear calculator" subtitle="Gearing and ratios" />
        </Group>

        <Group title="Marketplace">
          <MenuRow href="/marketplace" icon="market" title="Browse" subtitle="Buy gear from the community" />
          <MenuRow href="/marketplace/submit" icon="market" title="Sell an item" subtitle="List something for sale" />
          <MenuRow href="/marketplace/mine" icon="market" title="My listings" subtitle="Items you've listed for sale" />
          <MenuRow href="/orders" icon="orders" title="My orders" subtitle="Click & Collect order history" />
          <MenuRow href="/marketplace/basket" icon="basket" title="Basket" subtitle="Review and check out" />
        </Group>

        <Group title="Community">
          <MenuRow href="/showcase" icon="showcase" title="Shell showcase" subtitle="Vote on this week's shells" />
          <MenuRow href="/showcase/submit" icon="showcase" title="Submit a shell" subtitle="Enter your build" />
        </Group>

        <Group title="Account">
          <MenuRow href="/notifications" icon="bell" title="Notifications" subtitle="Alerts and updates" />
          <MenuRow href="/profile" icon="profile" title="Profile & settings" subtitle="Nickname, photo, theme" />
          <QrRow userId={user.id} />
          <ShareRow url={APP_URL} />
        </Group>

        {isStaff && (
          <Group title="Staff">
            <MenuRow href="/admin/check-in" icon="checkin" title="Check customer in" subtitle="Search a member or add a walk-in" tone="amber" />
            <MenuRow href="/admin/members" icon="members" title="Members" subtitle="Memberships, wallets and discounts" tone="amber" />
            {user.role === "admin" && (
              <MenuRow href="/admin/activity" icon="reports" title="Reports" subtitle="Revenue, activity and history" tone="amber" />
            )}
            <MenuRow
              href="/admin"
              icon="admin"
              title={user.role === "moderator" ? "Mod panel" : "Admin panel"}
              subtitle={winnerPending ? "Weekly showcase winner needs selecting" : "Today, events, alerts and more"}
              badge={winnerPending ? "Action" : undefined}
              tone="amber"
            />
          </Group>
        )}

        {user.role === "asbo-rc" && (
          <Group title="Work">
            <MenuRow href="/asbo-rc" icon="reports" title="ASBO-RC reports" subtitle="Consignment sales and settlement" tone="teal" />
          </Group>
        )}

        <Group title="App">
          <ClassicSwitchRow />
          <SignOutRow />
        </Group>
      </div>
    </div>
  );
}
