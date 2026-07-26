"use client";

import { useState } from "react";
import Link from "next/link";
import { updateFeedbackStatus, deleteFlaggedIncident } from "@/actions/feedback";
import { dismissPostReport, deletePost } from "@/actions/feed";
import type { UserFeedback } from "@/actions/feedback";
import type { FlaggedIncident } from "@/lib/moderation";
import type { ReportedPost } from "@/actions/feed";

interface FeedbackAdminClientProps {
  initialFeedbackList: UserFeedback[];
  initialFlaggedList: FlaggedIncident[];
  initialReportedList: ReportedPost[];
  currentUserId: string;
  currentUserRole: "admin" | "moderator" | "member";
}

export function FeedbackAdminClient({
  initialFeedbackList,
  initialFlaggedList,
  initialReportedList,
  currentUserId,
  currentUserRole,
}: FeedbackAdminClientProps) {
  const [activeTab, setActiveTab] = useState<"feedback" | "flagged" | "reported">("feedback");
  const [feedbackList, setFeedbackList] = useState<UserFeedback[]>(initialFeedbackList);
  const [flaggedList, setFlaggedList] = useState<FlaggedIncident[]>(initialFlaggedList);
  const [reportedList, setReportedList] = useState<ReportedPost[]>(initialReportedList);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleStatusChange(feedbackId: string, newStatus: "open" | "reviewed" | "resolved") {
    setActionLoading(feedbackId);
    const res = await updateFeedbackStatus(feedbackId, newStatus);
    if (res.success) {
      setFeedbackList((prev) =>
        prev.map((item) => (item.feedbackId === feedbackId ? { ...item, status: newStatus } : item))
      );
    }
    setActionLoading(null);
  }

  async function handleDeleteFlagged(flaggedId: string) {
    setActionLoading(flaggedId);
    const res = await deleteFlaggedIncident(flaggedId);
    if (res.success) {
      setFlaggedList((prev) => prev.filter((item) => item.flaggedId !== flaggedId));
    }
    setActionLoading(null);
  }

  async function handleDismissReport(reportId: string) {
    setActionLoading(reportId);
    const res = await dismissPostReport(reportId);
    if (res.success) {
      setReportedList((prev) => prev.filter((item) => item.reportId !== reportId));
    }
    setActionLoading(null);
  }

  async function handleDeleteReportedPost(reportId: string, postId: string) {
    setActionLoading(reportId);
    const delRes = await deletePost(postId, currentUserId, true);
    if (delRes.success || delRes.error === "Post not found") {
      await dismissPostReport(reportId);
      setReportedList((prev) => prev.filter((item) => item.reportId !== reportId));
    }
    setActionLoading(null);
  }

  const filteredFeedback = feedbackList.filter((f) => {
    if (categoryFilter !== "All" && f.category !== categoryFilter) return false;
    if (statusFilter !== "All" && f.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Tab Controls */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab("feedback")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "feedback"
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
          }`}
        >
          <span>💬 User Feedback</span>
          <span className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">
            {feedbackList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("reported")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "reported"
              ? "bg-red-600 text-white shadow-md shadow-red-600/20 font-black"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
          }`}
        >
          <span>🚨 Reported Posts</span>
          {reportedList.length > 0 ? (
            <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px] animate-pulse">
              {reportedList.length}
            </span>
          ) : (
            <span className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">0</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("flagged")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "flagged"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20 font-black"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
          }`}
        >
          <span>🛡️ Flagged Content</span>
          {flaggedList.length > 0 ? (
            <span className="bg-purple-500 text-white px-1.5 py-0.5 rounded-full text-[10px] animate-pulse">
              {flaggedList.length}
            </span>
          ) : (
            <span className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-[10px]">0</span>
          )}
        </button>
      </div>

      {/* Tab 1: User Feedback */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Category:</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                <option value="All">All Categories</option>
                <option value="General Feedback">General Feedback</option>
                <option value="Bug Report">Bug Reports</option>
                <option value="Feature Request">Feature Requests</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                <option value="All">All Statuses</option>
                <option value="open">Open</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {filteredFeedback.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
              <span className="text-3xl">📭</span>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mt-2">
                No user feedback entries found matching your filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFeedback.map((f) => (
                <div
                  key={f.feedbackId}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {f.userAvatar ? (
                        <img src={f.userAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-black flex items-center justify-center">
                          {f.userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{f.userName}</p>
                        <p className="text-[10px] text-zinc-400">{f.userEmail}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {f.category}
                      </span>

                      <select
                        value={f.status}
                        onChange={(e) =>
                          handleStatusChange(f.feedbackId, e.target.value as "open" | "reviewed" | "resolved")
                        }
                        disabled={actionLoading === f.feedbackId}
                        className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 border focus:outline-none ${
                          f.status === "resolved"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : f.status === "reviewed"
                            ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                            : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        <option value="open">STATUS: OPEN</option>
                        <option value="reviewed">STATUS: REVIEWED</option>
                        <option value="resolved">STATUS: RESOLVED</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    {f.comment}
                  </p>

                  {/* Attached images */}
                  {f.images && f.images.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        Attached Images ({f.images.length}):
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {f.images.map((imgUrl, i) => (
                          <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer" className="block shrink-0">
                            <img
                              src={imgUrl}
                              alt=""
                              className="w-20 h-20 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-400 text-right">
                    Submitted: {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Reported Posts */}
      {activeTab === "reported" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 space-y-1">
            <h3 className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <span>🚨</span> Member Reported Posts Queue
            </h3>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
              Community members have flagged the following posts for staff review. Click &quot;View Post on Newsfeed&quot; to inspect directly or delete the post.
            </p>
          </div>

          {reportedList.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
              <span className="text-3xl">✅</span>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mt-2">
                No active post reports requiring moderation.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportedList.map((item) => (
                <div
                  key={item.reportId}
                  className="rounded-2xl border border-red-500/30 bg-white dark:bg-zinc-900 p-5 space-y-4 shadow-xs"
                >
                  {/* Reporter Bar */}
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 px-2.5 py-0.5 rounded-full tracking-wider">
                        Report Reason: {item.reason}
                      </span>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                        Reported by: <strong className="text-zinc-900 dark:text-zinc-100">{item.reporterName}</strong> ({item.reporterEmail})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/newsfeed?postId=${item.postId}`}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all shadow-2xs flex items-center gap-1"
                      >
                        <span>🔗</span> View Post on Newsfeed →
                      </Link>
                    </div>
                  </div>

                  {/* Post Content Preview */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700/60 space-y-3">
                    <div className="flex items-center gap-2.5">
                      {item.postUserImage ? (
                        <img src={item.postUserImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                          {item.postUserName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{item.postUserName}</p>
                        <p className="text-[10px] text-zinc-400">Post Author • ID: {item.postUserId}</p>
                      </div>
                    </div>

                    {item.postText && (
                      <p className="text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {item.postText}
                      </p>
                    )}

                    {item.postImages && item.postImages.length > 0 && (
                      <div className="flex gap-2 flex-wrap pt-1">
                        {item.postImages.map((img, idx) => (
                          <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                            <img
                              src={img}
                              alt=""
                              className="w-24 h-24 rounded-lg object-cover border border-zinc-300 dark:border-zinc-700 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Moderation Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-zinc-400">
                      Reported: {new Date(item.createdAt).toLocaleString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDismissReport(item.reportId)}
                        disabled={actionLoading === item.reportId}
                        className="px-3.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {actionLoading === item.reportId ? "..." : "✓ Dismiss Report"}
                      </button>

                      <button
                        onClick={() => handleDeleteReportedPost(item.reportId, item.postId)}
                        disabled={actionLoading === item.reportId}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-colors shadow-xs disabled:opacity-50"
                      >
                        {actionLoading === item.reportId ? "Deleting..." : "🗑️ Delete Post"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Flagged Content */}
      {activeTab === "flagged" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 p-4 space-y-1">
            <h3 className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span>🛡️</span> AI Image Moderation Incident Log
            </h3>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
              The following image upload attempts were automatically flagged by Gemini AI as containing inappropriate content (NSFW, violence, hate speech, or offensive graphics) and were rejected before being saved.
            </p>
          </div>

          {flaggedList.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
              <span className="text-3xl">✅</span>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mt-2">
                No inappropriate image incidents recorded.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedList.map((item) => (
                <div
                  key={item.flaggedId}
                  className="rounded-2xl border border-purple-500/30 bg-white dark:bg-zinc-900 p-5 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Context: {item.context}
                      </span>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                        Attempted by: <span className="text-zinc-700 dark:text-zinc-300">{item.userName}</span> ({item.userEmail})
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteFlagged(item.flaggedId)}
                      disabled={actionLoading === item.flaggedId}
                      className="px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-purple-600 dark:hover:text-purple-400 text-xs font-bold transition-colors"
                    >
                      {actionLoading === item.flaggedId ? "Dismissing..." : "Dismiss Incident"}
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 items-start bg-purple-500/5 p-3 rounded-xl border border-purple-500/20">
                    <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img
                        src={item.imageUrl}
                        alt="Flagged image"
                        className="w-24 h-24 rounded-lg object-cover border border-purple-500/30 filter blur-xs hover:blur-none transition-all"
                      />
                    </a>
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-purple-600 dark:text-purple-400">
                        Flagged Reason:
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-400 text-right">
                    Attempted: {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
