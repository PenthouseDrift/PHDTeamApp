import Link from "next/link";

/**
 * Home-page tile for the card packs. With a credit it invites the member to open a pack; without
 * one it explains how to earn it (check in at the track).
 */
export function CardsPromo({ credits }: { credits: number }) {
  const has = credits > 0;
  return (
    <section
      aria-label="Cards"
      className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/60 p-5 text-zinc-100 shadow-sm"
    >
      <div className="flex items-center gap-4">
        {/* The cards on offer. Two pre-sized WebP files (240 and 480 wide) so phones download the small one. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cards-promo-480.webp"
          srcSet="/cards-promo-240.webp 240w, /cards-promo-480.webp 480w"
          sizes="(min-width: 640px) 176px, 128px"
          width={480}
          height={382}
          alt="Mythic and Legend cards from the card packs"
          loading="lazy"
          decoding="async"
          className="h-auto w-32 shrink-0 drop-shadow-[0_0_1rem_rgba(232,185,35,0.35)] sm:w-44"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">New · Collect your cards</p>
          <h2 className="text-lg font-black leading-tight">
            {has ? `You have ${credits} card credit${credits === 1 ? "" : "s"}` : "Earn cards by checking in"}
          </h2>
          <p className="text-sm text-zinc-300">
            {has
              ? "Open a pack to get a card of your own car. Bronze, silver, gold, legend and even a mythic."
              : "Every check-in at the track earns 1 credit, or 2 with a membership. Spend it on a pack and get a card of your own car."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={has ? "/cards/new" : "/cards"}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-black text-black transition-colors hover:bg-amber-400"
        >
          {has ? "Open a card pack" : "See my cards"}
        </Link>
        {has && (
          <Link
            href="/cards"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-600 px-5 text-sm font-bold text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            My cards
          </Link>
        )}
      </div>
    </section>
  );
}
