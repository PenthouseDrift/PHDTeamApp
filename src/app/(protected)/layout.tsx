import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Get custom avatar from Redis
  const customAvatar = await redis.hget(`member:${session.user.id}`, "customAvatar") as string | null;
  const userWithAvatar = {
    ...session.user,
    image: customAvatar || session.user.image || null,
  };

  return (
    <div className="flex h-dvh bg-zinc-50">
      <ProtectedNavigation user={userWithAvatar} />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
