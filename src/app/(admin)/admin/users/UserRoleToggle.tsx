"use client";

import { useTransition, useState } from "react";
import { setUserRole } from "@/actions/admin/users";

type Role = "admin" | "moderator" | "member" | "asbo-rc";

interface UserRoleToggleProps {
  userId: string;
  currentRole: Role;
}

export function UserRoleToggle({ userId, currentRole }: UserRoleToggleProps) {
  const [role, setRole] = useState<Role>(currentRole);
  const [isPending, startTransition] = useTransition();

  function handleChange(newRole: Role) {
    if (newRole === role) return;
    startTransition(async () => {
      const result = await setUserRole(userId, newRole);
      if (result.success) {
        setRole(result.data.role);
      }
    });
  }

  return (
    <select
      value={role}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value as Role)}
      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
    >
      <option value="member">👤 Member</option>
      <option value="moderator">🛡️ Moderator</option>
      <option value="admin">⚡ Admin</option>
      <option value="asbo-rc">🏷️ ASBO-RC</option>
    </select>
  );
}
