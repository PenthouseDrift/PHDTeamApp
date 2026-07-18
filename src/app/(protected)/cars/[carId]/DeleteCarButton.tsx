"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCar } from "@/actions/cars";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSession } from "next-auth/react";

interface DeleteCarButtonProps {
  carId: string;
  carName: string;
}

export function DeleteCarButton({ carId, carName }: DeleteCarButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!session?.user?.id) return;

    setDeleting(true);
    try {
      const result = await deleteCar(carId, session.user.id);
      if (result.success) {
        router.push("/cars");
      }
    } catch {
      // Error handling silently - could add toast in future
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={deleting}
        className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
      >
        {deleting ? "Deleting..." : "Delete"}
      </button>

      <ConfirmDialog
        open={showConfirm}
        title="Delete Car"
        message={`Are you sure you want to delete "${carName}"? This will also delete all calibration setups and images. This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
