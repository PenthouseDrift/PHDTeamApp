import { auth } from "@/lib/auth";
import { getAllUsers } from "@/actions/admin/users";
import { UserRoleToggle } from "./UserRoleToggle";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await getAllUsers();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">User Management</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {users.length} registered user{users.length !== 1 ? "s" : ""} — manage admin access
        </p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 p-8 text-center">
          <p className="text-zinc-500">No users registered yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-zinc-600">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-xs text-white font-bold">
                          {user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-zinc-900 font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.id !== session?.user?.id ? (
                      <UserRoleToggle userId={user.id} currentRole={user.role} />
                    ) : (
                      <span className="text-xs text-zinc-400">You</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
