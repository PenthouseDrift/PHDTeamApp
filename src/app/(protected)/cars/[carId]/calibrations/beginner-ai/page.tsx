import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCar } from "@/actions/cars";
import { BeginnerAIWizard } from "./BeginnerAIWizard";

export const dynamic = "force-dynamic";

interface BeginnerAIPageProps {
  params: Promise<{ carId: string }>;
}

export default async function BeginnerAIPage({ params }: BeginnerAIPageProps) {
  const { carId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const result = await getCar(carId, session.user.id);
  if (!result.success) {
    notFound();
  }

  const car = result.data;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back Link */}
        <Link
          href={`/cars/${carId}`}
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {car.name}
        </Link>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
              <span className="text-xl">✨</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Generate Beginner Setup for {car.name}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Step-by-step AI wizard to create a complete starting baseline calibration from scratch
              </p>
            </div>
          </div>
        </div>

        {/* Wizard Client Component */}
        <BeginnerAIWizard car={car} userId={session.user.id} />
      </div>
    </div>
  );
}
