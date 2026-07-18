import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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

  return (
    <div className="flex h-dvh bg-zinc-50">
      <ProtectedNavigation user={session.user} />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
