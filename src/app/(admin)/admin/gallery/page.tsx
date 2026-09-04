import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGalleryImages } from "@/actions/admin/gallery";
import { GalleryAdminClient } from "./GalleryAdminClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard");
  }

  const images = await getGalleryImages();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span>←</span> Admin
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Website Gallery</h1>
          </div>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Upload photos to feature in the &ldquo;From the Track&rdquo; gallery on the public
          website. Images marked <span className="font-semibold">Show on website</span> appear
          alongside shell showcase winners and newsfeed photos.
        </p>

        <GalleryAdminClient initialImages={images} />
      </div>
    </div>
  );
}
