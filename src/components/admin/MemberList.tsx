"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberListProps {
  members: MemberWithMembership[];
  checkedInMembers: MemberWithMembership[];
  userRole?: "admin" | "moderator" | "member" | "asbo-rc";
  /** New experience: member "Check-In" goes to the check-in desk. */
  useDesk?: boolean;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const pill = "inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border whitespace-nowrap";

/** Role badge for staff / partners, membership status for everyone else. */
function StatusCell({ m, isModerator }: { m: MemberWithMembership; isModerator: boolean }) {
  if (m.member.role === "admin") {
    return (
      <span className={`${pill} bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800`}>
        Admin
      </span>
    );
  }
  if (m.member.role === "moderator") {
    return (
      <span className={`${pill} bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800`}>
        Moderator
      </span>
    );
  }
  if (m.member.role === "asbo-rc") {
    return (
      <span className={`${pill} bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800`}>
        ASBO-RC
      </span>
    );
  }
  if (isModerator) {
    return (
      <span className={`${pill} bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700`}>
        Member
      </span>
    );
  }
  return <StatusBadge status={m.membership?.status ?? "expired"} size="sm" />;
}

/** When the membership ends (or what staff get instead). */
function ExpiryText({ m }: { m: MemberWithMembership }) {
  if (m.member.role === "admin" || m.member.role === "moderator") {
    return <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Staff Access</span>;
  }
  if (!m.membership) return <>—</>;
  if (m.membership.status === "active") return <>{formatDate(m.membership.expiresAt)}</>;
  return (
    <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
      Expired on {formatDate(m.membership.expiresAt)}
    </span>
  );
}

function CheckInCount({ m }: { m: MemberWithMembership }) {
  const n = m.member.checkinCount ?? 0;
  if (n <= 0) return null;
  return (
    <span
      title={`${n} total check-in${n !== 1 ? "s" : ""}`}
      className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold px-1.5 py-0.5 align-middle whitespace-nowrap"
    >
      ✅ {n}
    </span>
  );
}

interface RowProps {
  m: MemberWithMembership;
  isCheckedIn: boolean;
  isModerator: boolean;
  onSelect: (m: MemberWithMembership) => void;
}

/** Narrow layouts: one tappable card per person. */
function MemberCard({ m, isCheckedIn, isModerator, onSelect }: RowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(m)}
        className={`flex w-full flex-col gap-2 rounded-xl border p-3.5 text-left shadow-sm transition-colors active:scale-[0.995] ${
          isCheckedIn
            ? "border-green-200 bg-green-50/70 hover:bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
            : "border-zinc-200 bg-white hover:border-amber-300 dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              {isCheckedIn && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Checked in today" />}
              <span
                className={`truncate text-sm font-bold ${
                  isCheckedIn ? "text-green-700 dark:text-green-400" : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {m.member.name}
              </span>
              <CheckInCount m={m} />
            </span>
            {m.member.nickname && (
              <span className="block truncate text-xs font-bold text-amber-600 dark:text-amber-400">
                &quot;{m.member.nickname}&quot;
              </span>
            )}
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{m.member.email}</span>
          </span>
          <span className="shrink-0">
            <StatusCell m={m} isModerator={isModerator} />
          </span>
        </span>
        {!isModerator && (
          <span className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="text-zinc-600 dark:text-zinc-300">
              <ExpiryText m={m} />
            </span>
            <span className="font-medium text-zinc-400">Details →</span>
          </span>
        )}
      </button>
    </li>
  );
}

/** Wide layouts: a table row. Keyboard-operable as well as clickable. */
function MemberRow({ m, isCheckedIn, isModerator, onSelect }: RowProps) {
  return (
    <tr
      tabIndex={0}
      onClick={() => onSelect(m)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(m);
        }
      }}
      className={`group cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
        isCheckedIn ? "bg-green-50/60 hover:bg-green-50 dark:bg-green-950/20" : "hover:bg-amber-50/50 dark:hover:bg-zinc-800/60"
      }`}
    >
      <td className="px-4 py-3 font-medium">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {isCheckedIn && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Checked in today" />}
          <span className={isCheckedIn ? "text-green-700 dark:text-green-400" : "text-zinc-900 dark:text-zinc-100"}>
            {m.member.name}
          </span>
          {m.member.nickname && (
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">(&quot;{m.member.nickname}&quot;)</span>
          )}
          <CheckInCount m={m} />
        </span>
      </td>
      <td className="max-w-[16rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400" title={m.member.email}>
        {m.member.email}
      </td>
      <td className="px-4 py-3">
        <StatusCell m={m} isModerator={isModerator} />
      </td>
      {!isModerator && (
        <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
          <ExpiryText m={m} />
        </td>
      )}
      <td className="px-4 py-3 text-right">
        <span className="whitespace-nowrap text-xs font-medium text-zinc-400 transition-colors group-hover:text-amber-500">
          View details →
        </span>
      </td>
    </tr>
  );
}

/**
 * One group of people. Below ~768px of AVAILABLE width (the admin sidebar eats
 * a quarter of a tablet) it's a list of cards, two across when there's room;
 * above that it's a table. Container queries, so it follows the space the list
 * really gets rather than the viewport.
 */
function MemberGroup({
  list,
  staff,
  isModerator,
  checkedInIds,
  onSelect,
}: {
  list: MemberWithMembership[];
  staff?: boolean;
  isModerator: boolean;
  checkedInIds: Set<string>;
  onSelect: (m: MemberWithMembership) => void;
}) {
  const showExpiry = !isModerator;
  return (
    <>
      <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @3xl:hidden">
        {list.map((m) => (
          <MemberCard key={m.member.id} m={m} isCheckedIn={checkedInIds.has(m.member.id)} isModerator={isModerator} onSelect={onSelect} />
        ))}
      </ul>

      <div
        className={`hidden overflow-x-auto rounded-lg border bg-white @3xl:block dark:bg-zinc-900 ${
          staff ? "border-purple-100 dark:border-purple-900/40" : "border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <table className="w-full text-sm">
          <thead
            className={`border-b ${
              staff
                ? "border-purple-100 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/30"
                : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
            }`}
          >
            <tr className="text-left text-zinc-600 dark:text-zinc-400">
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Email</th>
              <th scope="col" className="px-4 py-3 font-medium">{isModerator || staff ? "Role" : "Status"}</th>
              {showExpiry && <th scope="col" className="px-4 py-3 font-medium">{staff ? "Access" : "Expires"}</th>}
              <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className={`divide-y ${staff ? "divide-purple-50 dark:divide-purple-900/20" : "divide-zinc-100 dark:divide-zinc-800/50"}`}>
            {list.map((m) => (
              <MemberRow key={m.member.id} m={m} isCheckedIn={checkedInIds.has(m.member.id)} isModerator={isModerator} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function MemberList({ members, checkedInMembers, userRole, useDesk = false }: MemberListProps) {
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithMembership | null>(null);

  const checkedInIds = new Set(checkedInMembers.map((m) => m.member.id));
  const isModerator = userRole === "moderator";

  const allFiltered = search
    ? members.filter((m) => {
        const query = search.toLowerCase();
        return (
          m.member.name.toLowerCase().includes(query) ||
          (m.member.nickname && m.member.nickname.toLowerCase().includes(query)) ||
          m.member.email.toLowerCase().includes(query)
        );
      })
    : members;

  const rawRegularMembers = allFiltered.filter((m) => m.member.role !== "admin" && m.member.role !== "moderator");

  // For admins: sort active Members first A-Z, then Users A-Z
  const regularMembers = [...rawRegularMembers].sort((a, b) => {
    const aActive = a.membership?.status === "active";
    const bActive = b.membership?.status === "active";

    if (!isModerator && aActive !== bActive) {
      return aActive ? -1 : 1;
    }
    return a.member.name.localeCompare(b.member.name);
  });

  const activeMemberCount = rawRegularMembers.filter((m) => m.membership?.status === "active").length;
  const userCount = rawRegularMembers.length - activeMemberCount;

  const staffMembers = isModerator
    ? []
    : allFiltered
        .filter((m) => m.member.role === "admin" || m.member.role === "moderator")
        .sort((a, b) => a.member.name.localeCompare(b.member.name));

  return (
    <div className="@container space-y-6">
      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="search"
          aria-label="Search members"
          placeholder="Search members by name, nickname, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Members & Users */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {!isModerator ? (
            <>
              Members &amp; Users
              <span className="ml-2 text-xs font-normal text-zinc-400">
                ({activeMemberCount} Active Member{activeMemberCount !== 1 ? "s" : ""}, {userCount} User{userCount !== 1 ? "s" : ""})
              </span>
            </>
          ) : (
            <>
              Members
              <span className="ml-2 text-xs font-normal text-zinc-400">({regularMembers.length})</span>
            </>
          )}
        </h3>
        {regularMembers.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {search ? "No members found" : "No members to show"}
          </div>
        ) : (
          <MemberGroup
            list={regularMembers}
            isModerator={isModerator}
            checkedInIds={checkedInIds}
            onSelect={setSelectedMember}
          />
        )}
      </div>

      {/* Admins & Moderators */}
      {staffMembers.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <span aria-hidden>🛡️</span> Admins &amp; Moderators
            <span className="text-xs font-normal text-zinc-400">({staffMembers.length})</span>
          </h3>
          <MemberGroup
            list={staffMembers}
            staff
            isModerator={isModerator}
            checkedInIds={checkedInIds}
            onSelect={setSelectedMember}
          />
        </div>
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          checkInHref={useDesk ? `/admin/check-in?member=${encodeURIComponent(selectedMember.member.id)}` : undefined}
          onClose={() => setSelectedMember(null)}
          onUpdate={(fb) => {
            setFeedback(fb);
            setTimeout(() => setFeedback(null), 5000);
          }}
        />
      )}
    </div>
  );
}
