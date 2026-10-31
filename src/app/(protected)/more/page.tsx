import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { redirectIfNewDashboard } from "@/lib/dashboard-pref";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const session = await auth();
  if (!session?.user) return null;

  // New-experience members use the Menu tab instead.
  await redirectIfNewDashboard(session.user.id, "/dashboard2/menu");

  const memberData = await redis.hgetall(`member:${session.user.id}`);

  const customAvatar = (memberData?.customAvatar as string) || null;
  const nickname = (memberData?.nickname as string) || "";
  const avatarUrl = customAvatar || session.user.image || null;
  const displayName = nickname.trim() || session.user.name || "Member";

  const featureLinks = [
    {
      title: "Tandem Clash Arena",
      description: "Play 3v3 RC drift card battles, roll real UK tracks, defeat rivals and win P-Credits",
      href: "/cards?tab=clash",
      icon: CardsIcon,
      badge: "Game",
      iconColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "My Cards & Packs",
      description: "Earn a credit each time you check in, then open card packs of your own car or community cars",
      href: "/cards",
      icon: CardsIcon,
      badge: "TCG",
      iconColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "My Orders",
      description: "Track your Click & Collect orders and collection status",
      href: "/orders",
      icon: OrdersIcon,
      badge: "Orders",
      iconColor: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    },
    {
      title: "Shell Showcase",
      description: "Browse custom body shell designs & vote in weekly competitions",
      href: "/showcase",
      icon: ShowcaseIcon,
      badge: "Community",
      iconColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "28-Day Track Membership",
      description: "Purchase or renew your 28-day track access membership",
      href: "/membership/purchase",
      icon: MembershipIcon,
      badge: "Track Pass",
      iconColor: "text-teal-500 bg-teal-500/10 border-teal-500/20",
    },
  ];

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* User Card Header */}
        <div className="flex items-center justify-between rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-500/40"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-amber-500 flex items-center justify-center text-lg font-bold text-black">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{displayName}</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Explore all Penthouse Drift features & tools</p>
            </div>
          </div>

          {(session.user.role === "admin" || session.user.role === "moderator") && (
            <Link
              href="/admin"
              className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold px-3.5 py-2 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
            >
              <AdminIcon className="w-4 h-4" />
              <span>{session.user.role === "moderator" ? "Mod Panel" : "Admin Panel"}</span>
            </Link>
          )}
        </div>

        {/* Feature Links Grid */}
        <section className="space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">All App Links & Features</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featureLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 flex items-start gap-4 hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all shadow-sm hover:shadow-md"
                >
                  <div className={`p-3 rounded-xl border ${item.iconColor} shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors truncate">
                        {item.title}
                      </h3>
                      {item.badge && (
                        <span className="rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* Flat Vector SVG Icons */
function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />
    </svg>
  );
}

function ShowcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}



function MembershipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function OrdersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 21H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 6.75h12.974c.576 0 1.059.435 1.119 1.007Z" />
    </svg>
  );
}




