import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeedbackList, getFlaggedContentList } from "@/actions/feedback";
import { getReportedPostsList } from "@/actions/feed";
import { FeedbackAdminClient } from "./FeedbackAdminClient";

export default async function AdminFeedbackPage() {
  const session = await auth();

  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
    redirect("/dashboard");
  }

  const [feedbackRes, flaggedRes, reportedRes] = await Promise.all([
    getFeedbackList(),
    getFlaggedContentList(),
    getReportedPostsList(),
  ]);

  const feedbackList = feedbackRes.success ? feedbackRes.data : [];
  const flaggedList = flaggedRes.success ? flaggedRes.data : [];
  const reportedList = reportedRes.success ? reportedRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          User Feedback &amp; Safety Moderation
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review beta user feedback, bug reports, feature ideas, AI-flagged uploads, and reported community posts.
        </p>
      </div>

      <FeedbackAdminClient
        initialFeedbackList={feedbackList}
        initialFlaggedList={flaggedList}
        initialReportedList={reportedList}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
      />
    </div>
  );
}
