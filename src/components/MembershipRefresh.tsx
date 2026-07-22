"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MembershipRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Check every 60 seconds if membership status might have changed
    const timer = setInterval(() => {
      router.refresh();
    }, 60000);

    return () => clearInterval(timer);
  }, [router]);

  return null;
}
