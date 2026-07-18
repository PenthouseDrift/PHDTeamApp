import { getAllMembers } from "@/actions/admin/members";
import { MemberList } from "@/components/admin/MemberList";

export default async function AdminMembersPage() {
  const members = await getAllMembers();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Members</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {members.length} registered member{members.length !== 1 ? "s" : ""}
        </p>
      </div>
      <MemberList members={members} />
    </div>
  );
}
