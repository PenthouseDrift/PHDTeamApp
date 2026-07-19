import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getOrCreateQRCode } from "@/actions/qr";
import { QRDownloadButton } from "@/components/QRDownloadButton";
import { ProfileQRError } from "./ProfileQRError";
import { ProfileAvatarUpload } from "./ProfileAvatarUpload";
import { SignOutSection } from "./SignOutSection";

export const dynamic = "force-dynamic";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const { user } = session;
  const qrResult = await getOrCreateQRCode(user.id);

  // Get custom avatar from Redis (if uploaded)
  const customAvatar = await redis.hget(`member:${user.id}`, "customAvatar") as string | null;
  const avatarUrl = customAvatar || user.image || null;

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-zinc-900">My Profile</h1>

        {/* Profile Info */}
        <section className="rounded-xl bg-white border border-zinc-200 p-6">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-2 ring-zinc-200"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white">
                {getInitials(user.name)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                {user.name ?? "Member"}
              </h2>
              <p className="text-sm text-zinc-500">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 capitalize">
                {user.role}
              </span>
            </div>
          </div>
        </section>

        {/* Profile Picture Upload */}
        <section className="rounded-xl bg-white border border-zinc-200 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            Profile Picture
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            Upload a custom profile picture to replace your Google avatar.
          </p>
          <ProfileAvatarUpload currentAvatar={avatarUrl} userId={user.id} initials={getInitials(user.name)} />
        </section>

        {/* QR Code */}
        <section className="rounded-xl bg-white border border-zinc-200 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            Check-in QR Code
          </h2>
          <p className="mb-6 text-sm text-zinc-500">
            Present this QR code at the track to check in quickly.
          </p>

          {qrResult.success ? (
            <div className="flex flex-col items-center gap-6">
              <div className="rounded-xl bg-white border border-zinc-200 p-4">
                <img
                  src={qrResult.data}
                  alt="Member QR Code"
                  width={300}
                  height={300}
                  className="h-auto w-full max-w-[300px]"
                />
              </div>
              <QRDownloadButton dataUrl={qrResult.data} />
            </div>
          ) : (
            <ProfileQRError message={qrResult.error} />
          )}
        </section>

        {/* Sign Out */}
        <SignOutSection />
      </div>
    </div>
  );
}
