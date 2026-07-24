"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberListProps {
  members: MemberWithMembership[];
  checkedInMembers: MemberWithMembership[];
}

export function MemberList({ members, checkedInMembers }: MemberListProps) {
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithMembership | null>(null);

  const filtered = search
    ? members.filter((m) => {
        const query = search.toLowerCase();
        return (
          m.member.name.toLowerCase().includes(query) ||
          (m.member.nickname && m.member.nickname.toLowerCase().includes(query)) ||
          m.member.email.toLowerCase().includes(query)
        );
      })
    : members;

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-4">
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
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Checked in today section */}
      {checkedInMembers.length > 0 && !search && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-medium text-green-700 mb-2">Already checked in today:</p>
          <div className="flex flex-wrap gap-2">
            {checkedInMembers.map((m) => (
              <span key={m.member.id} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {m.member.name}{m.member.nickname ? ` ("${m.member.nickname}")` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Member list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          {search ? "No members found" : "No members to show"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-zinc-600">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Expires</th>
                <th className="px-4 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((m) => (
                <tr
                  key={m.member.id}
                  className="hover:bg-amber-50/50 transition-colors cursor-pointer group"
                  onClick={() => setSelectedMember(m)}
                >
                  <td className="px-4 py-3 text-zinc-900 font-medium">
                    <span>{m.member.name}</span>
                    {m.member.nickname && (
                      <span className="ml-1.5 inline-block text-xs font-bold text-amber-600">
                        (&quot;{m.member.nickname}&quot;)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell">
                    {m.member.email}
                  </td>
                  <td className="px-4 py-3">
                    {m.member.role === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 bg-purple-50 text-purple-700">
                        Admin
                      </span>
                    ) : (
                      <StatusBadge status={m.membership?.status ?? "expired"} size="sm" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 hidden md:table-cell">
                    {m.membership ? formatDate(m.membership.expiresAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium text-zinc-400 group-hover:text-amber-500 transition-colors whitespace-nowrap">
                      View details →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
