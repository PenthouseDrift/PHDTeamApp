"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { performCheckIn } from "@/actions/checkin";
import { activateMembership } from "@/actions/admin/membership";
import type { MemberWithMembership } from "@/actions/admin/members";

interface MemberListProps {
  members: MemberWithMembership[];
}

export function MemberList({ members }: MemberListProps) {
  const [search, setSearch] = useState("");
  const [confirmMember, setConfirmMember] = useState<MemberWithMembership | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { data: session } = useSession();

  const filtered = members.filter((m) => {
    const query = search.toLowerCase();
    return (
      m.member.name.toLowerCase().includes(query) ||
      m.member.email.toLowerCase().includes(query)
    );
  });

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function handleCheckIn(member: MemberWithMembership) {
    if (member.membership?.status !== "active") return;
    setConfirmMember(member);
  }

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

  function confirmCheckIn() {
    if (!confirmMember || !session?.user?.id) return;

    startTransition(async () => {
      const result = await performCheckIn(
        confirmMember.member.id,
        session.user.id,
        "manual"
      );

      if (result.success) {
        setFeedback({ type: "success", message: `${confirmMember.member.name} checked in successfully` });
      } else {
        setFeedback({ type: "error", message: result.error });
      }

      setConfirmMember(null);
      setTimeout(() => setFeedback(null), 4000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-colors"
        />
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Member list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {search ? "No results found" : "No members yet"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50">
              <tr className="text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Expires</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((m) => (
                <tr key={m.member.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3 text-zinc-900 font-medium">
                    {m.member.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                    {m.member.email}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={m.membership?.status ?? "expired"}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">
                    {m.membership ? formatDate(m.membership.expiresAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {m.membership?.status !== "active" && (
                        <button
                          onClick={() => handleActivate(m.member.id, m.member.name)}
                          disabled={isPending}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleCheckIn(m)}
                        disabled={m.membership?.status !== "active" || isPending}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          m.membership?.status === "active"
                            ? "bg-green-600 hover:bg-green-700 text-zinc-900"
                            : "bg-zinc-100 text-zinc-500 cursor-not-allowed"
                        }`}
                      >
                        {m.membership?.status === "active" ? "Check In" : "No Membership"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={!!confirmMember}
        title="Confirm Check-In"
        message={`Check in ${confirmMember?.member.name ?? "this member"} manually?`}
        confirmLabel="Check In"
        cancelLabel="Cancel"
        onConfirm={confirmCheckIn}
        onCancel={() => setConfirmMember(null)}
      />
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}
