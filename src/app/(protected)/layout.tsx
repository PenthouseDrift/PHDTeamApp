import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProtectedNavigation } from "@/components/ProtectedNavigation";

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
    <div className="flex h-dvh bg-zinc-950">
      <ProtectedNavigation user={session.user} />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
