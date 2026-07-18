import { auth } from "@/lib/auth";
import { getAllUsers } from "@/actions/admin/users";
import { UserRoleToggle } from "./UserRoleToggle";

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await getAllUsers();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {users.length} registered user{users.length !== 1 ? "s" : ""} — manage admin access
        </p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">No users registered yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-white font-medium">
                          {user.name[0]}
                        </div>
                      )}
                      <span className="text-white font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-zinc-700 text-zinc-300"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.id !== session?.user?.id ? (
                      <UserRoleToggle userId={user.id} currentRole={user.role} />
                    ) : (
                      <span className="text-xs text-zinc-500">You</span>
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
