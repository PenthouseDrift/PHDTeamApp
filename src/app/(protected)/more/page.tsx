import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const session = await auth();
  if (!session?.user) return null;

  const memberData = await redis.hgetall(`member:${session.user.id}`);

  const customAvatar = (memberData?.customAvatar as string) || null;
  const nickname = (memberData?.nickname as string) || "";
  const avatarUrl = customAvatar || session.user.image || null;
  const displayName = nickname.trim() || session.user.name || "Member";

  const featureLinks = [
    {
      title: "Wheel Visualizer",
      description: "Preview & compare aftermarket wheels on your RC drift car",
      href: "/shop/visualizer",
      icon: WheelIcon,
      badge: "Wheels",
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

function WheelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path strokeLinecap="round" d="M12 9.5V3M12 21v-5.5M9.5 12H3M21 12h-5.5M10.1 10.1 5.7 5.7M18.3 18.3l-4.4-4.4M13.9 10.1l4.4-4.4M5.7 18.3l4.4-4.4" />
    </svg>
  );
}




