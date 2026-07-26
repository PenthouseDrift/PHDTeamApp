import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeedbackList, getFlaggedContentList } from "@/actions/feedback";
import { FeedbackAdminClient } from "./FeedbackAdminClient";

export default async function AdminFeedbackPage() {
  const session = await auth();

  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
    redirect("/dashboard");
  }

  const [feedbackRes, flaggedRes] = await Promise.all([
    getFeedbackList(),
    getFlaggedContentList(),
  ]);

  const feedbackList = feedbackRes.success ? feedbackRes.data : [];
  const flaggedList = flaggedRes.success ? flaggedRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          User Feedback &amp; Safety Moderation
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review beta user feedback, bug reports, feature ideas, and AI-flagged image uploads.
        </p>
      </div>

      <FeedbackAdminClient
        initialFeedbackList={feedbackList}
        initialFlaggedList={flaggedList}
      />
    </div>
  );
}
