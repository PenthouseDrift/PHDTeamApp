"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { activateMembership } from "@/actions/admin/membership";
import { quickCheckIn } from "@/actions/admin/checkins";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberListProps {
  members: MemberWithMembership[];
  checkedInMembers: MemberWithMembership[];
}

export function MemberList({ members, checkedInMembers }: MemberListProps) {
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { data: session } = useSession();

  const allMembers = [...members];
  const filtered = search
    ? allMembers.filter((m) => {
        const query = search.toLowerCase();
        return (
          m.member.name.toLowerCase().includes(query) ||
          m.member.email.toLowerCase().includes(query)
        );
      })
    : allMembers;

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function handleQuickCheckIn(memberId: string, memberName: string) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const result = await quickCheckIn(memberId, memberName, session.user.id);
      if (result.success) {
        setFeedback({ type: "success", message: `${memberName} checked in!` });
      } else {
        setFeedback({ type: "error", message: result.error });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  }

  const [overrideMember, setOverrideMember] = useState<{ id: string; name: string } | null>(null);
  const [overrideDate, setOverrideDate] = useState("");

  function handleActivate(memberId: string, memberName: string) {
    startTransition(async () => {
      const result = await activateMembership(memberId);
      if (result.success) {
        const expiryDate = new Date(result.data.expiresAt).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        setFeedback({ type: "success", message: `${memberName} membership activated until ${expiryDate}` });
      } else {
        setFeedback({ type: "error", message: result.error });
      }
      setTimeout(() => setFeedback(null), 5000);
    });
  }

  function handleOverrideDate() {
    if (!overrideMember || !overrideDate) return;
    startTransition(async () => {
      const result = await activateMembership(overrideMember.id, overrideDate);
      if (result.success) {
        const expiryDate = new Date(result.data.expiresAt).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        setFeedback({ type: "success", message: `${overrideMember.name} membership set until ${expiryDate}` });
      } else {
        setFeedback({ type: "error", message: result.error });
      }
      setOverrideMember(null);
      setOverrideDate("");
      setTimeout(() => setFeedback(null), 5000);
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
          placeholder="Search members to check in..."
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
                {m.member.name}
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
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((m) => (
                <tr key={m.member.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3 text-zinc-900 font-medium">
                    {m.member.name}
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
                    {m.member.role !== "admin" && (
                      <div className="flex items-center justify-end gap-2">
                        {m.membership?.status !== "active" && (
                          <button
                            onClick={() => handleActivate(m.member.id, m.member.name)}
                            disabled={isPending}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-50"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => setOverrideMember({ id: m.member.id, name: m.member.name })}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                        >
                          Set Date
                        </button>
                        <button
                          onClick={() => handleQuickCheckIn(m.member.id, m.member.name)}
                          disabled={isPending}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          Check In
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Date Override Modal */}
      {overrideMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOverrideMember(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">Set Membership End Date</h3>
            <p className="text-sm text-zinc-500">Override the expiry date for {overrideMember.name}.</p>
            <input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setOverrideMember(null)}
                className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOverrideDate}
                disabled={!overrideDate || isPending}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Saving..." : "Set Date"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
