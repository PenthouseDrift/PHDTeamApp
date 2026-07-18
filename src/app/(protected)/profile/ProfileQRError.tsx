"use client";

import { useRouter } from "next/navigation";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

interface ProfileQRErrorProps {
  message: string;
}

export function ProfileQRError({ message }: ProfileQRErrorProps) {
  const router = useRouter();

  return (
    <ErrorMessage
      message={message}
      onRetry={() => router.refresh()}
    />
  );
}
