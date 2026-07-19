"use client";

import { useTransition, useState } from "react";
import { toggleAdminRole } from "@/actions/admin/users";

interface UserRoleToggleProps {
  userId: string;
  currentRole: "admin" | "member";
}

export function UserRoleToggle({ userId, currentRole }: UserRoleToggleProps) {
  const [role, setRole] = useState(currentRole);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const newIsAdmin = role !== "admin";
    startTransition(async () => {
      const result = await toggleAdminRole(userId, newIsAdmin);
      if (result.success) {
        setRole(result.data.role);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
        role === "admin"
          ? "bg-red-50 text-red-700 hover:bg-red-100"
          : "bg-purple-50 text-purple-700 hover:bg-purple-100"
      }`}
    >
      {isPending
        ? "Updating..."
        : role === "admin"
        ? "Remove Admin"
        : "Make Admin"}
    </button>
  );
}
