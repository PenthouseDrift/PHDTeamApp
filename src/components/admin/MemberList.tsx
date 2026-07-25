"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberListProps {
  members: MemberWithMembership[];
  checkedInMembers: MemberWithMembership[];
  userRole?: "admin" | "moderator" | "member";
}

export function MemberList({ members, checkedInMembers, userRole }: MemberListProps) {
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

  const rawRegularMembers = allFiltered.filter(
    (m) => m.member.role !== "admin" && m.member.role !== "moderator"
  );

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

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function MemberRow({ m }: { m: MemberWithMembership }) {
    const isCheckedIn = checkedInIds.has(m.member.id);
    return (
      <tr
        className={`transition-colors cursor-pointer group ${
          isCheckedIn ? "bg-green-50/60 hover:bg-green-50 dark:bg-green-950/20" : "hover:bg-amber-50/50 dark:hover:bg-zinc-800/60"
        }`}
        onClick={() => setSelectedMember(m)}
      >
        <td className="px-4 py-3 font-medium">
          <span className="inline-flex items-center gap-2">
            {isCheckedIn && (
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Checked in today" />
            )}
            <span className={isCheckedIn ? "text-green-700 dark:text-green-400" : "text-zinc-900 dark:text-zinc-100"}>{m.member.name}</span>
          </span>
          {m.member.nickname && (
            <span className="ml-1.5 inline-block text-xs font-bold text-amber-600 dark:text-amber-400">
              (&quot;{m.member.nickname}&quot;)
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 hidden sm:table-cell">
          {m.member.email}
        </td>
        <td className="px-4 py-3">
          {m.member.role === "admin" ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Admin
            </span>
          ) : m.member.role === "moderator" ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Moderator
            </span>
          ) : isModerator ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              Member
            </span>
          ) : (
            <StatusBadge status={m.membership?.status ?? "expired"} size="sm" />
          )}
        </td>
        {!isModerator && (
          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 hidden md:table-cell">
            {m.member.role === "admin" || m.member.role === "moderator" ? (
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Staff Access</span>
            ) : m.membership ? (
              m.membership.status === "active" ? (
                formatDate(m.membership.expiresAt)
              ) : (
                <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                  Expired on {formatDate(m.membership.expiresAt)}
                </span>
              )
            ) : (
              "—"
            )}
          </td>
        )}
        <td className="px-4 py-3 text-right">
          <span className="text-xs font-medium text-zinc-400 group-hover:text-amber-500 transition-colors whitespace-nowrap">
            View details →
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          placeholder="Search members by name, nickname, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Members & Users table */}
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
          <div className="text-center py-8 text-zinc-500 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
            {search ? "No members found" : "No members to show"}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <tr className="text-left text-zinc-600 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 font-medium">{isModerator ? "Role" : "Status"}</th>
                  {!isModerator && <th className="px-4 py-3 font-medium hidden md:table-cell">Expires</th>}
                  <th className="px-4 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {regularMembers.map((m) => <MemberRow key={m.member.id} m={m} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admins & Moderators table */}
      {staffMembers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <span>🛡️</span> Admins &amp; Moderators
            <span className="text-xs font-normal text-zinc-400">({staffMembers.length})</span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-purple-100 dark:border-purple-900/40 bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-purple-50/60 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/40">
                <tr className="text-left text-zinc-600 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell"></th>
                  <th className="px-4 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50 dark:divide-purple-900/20">
                {staffMembers.map((m) => <MemberRow key={m.member.id} m={m} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
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
