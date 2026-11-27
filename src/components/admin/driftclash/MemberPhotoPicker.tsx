"use client";

import { useEffect, useState } from "react";
import { listMemberRawPhotosAction, type MemberRawPhoto } from "@/actions/admin/driftclash-packs";
import { inputCls, labelCls } from "@/components/admin/driftclash/preview";

/**
 * The raw car photos members saved on their spec sheets: the picture before any card was drawn from it. Pick one to make a
 * card from (it is redrawn in a style, or used as it is). Only members who have saved a spec sheet with a photo appear.
 * The list is loaded once and searched on screen.
 */
export function MemberPhotoPicker({
  onPick,
  disabled = false,
}: {
  onPick: (photo: MemberRawPhoto) => void;
  disabled?: boolean;
}) {
  const [photos, setPhotos] = useState<MemberRawPhoto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    listMemberRawPhotosAction()
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setPhotos(res.data.photos);
          setTruncated(res.data.truncated);
        } else {
          setError(res.error);
          setPhotos([]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load the members' photos");
        setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = search.trim().toLowerCase();
  const shown = (photos ?? []).filter(
    (p) => !q || [p.label, p.chassis, p.driver, p.team, p.parts, p.owner].some((v) => v.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="mp-search" className={labelCls}>
          Search members&apos; car photos
        </label>
        <input
          id="mp-search"
          type="search"
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={60}
          placeholder="Car, chassis, driver, team, parts or member"
        />
      </div>

      <div role="status" aria-live="polite">
        {photos === null && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}
        {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
        {photos !== null && !error && photos.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No member has saved a car photo on a spec sheet yet.</p>
        )}
        {photos !== null && photos.length > 0 && shown.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos match.</p>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(p)}
                aria-label={`Use the photo of ${p.label} by ${p.owner}`}
                className="w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.photoUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-xl border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-900"
                />
                <span className="mt-1 block truncate text-xs font-bold">{p.label}</span>
                <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {p.owner}
                  {p.chassis ? ` · ${p.chassis}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {truncated && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing the 200 newest photos.</p>
      )}
    </div>
  );
}
