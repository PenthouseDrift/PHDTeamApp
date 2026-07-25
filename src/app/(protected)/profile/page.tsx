import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getOrCreateQRCode } from "@/actions/qr";
import { QRDownloadButton } from "@/components/QRDownloadButton";
import { ProfileQRError } from "./ProfileQRError";
import { ProfileAvatarUpload } from "./ProfileAvatarUpload";
import { ProfileNicknameForm } from "./ProfileNicknameForm";
import { SignOutSection } from "./SignOutSection";
import { ThemeToggle } from "./ThemeToggle";

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

  // Get member & membership data from Redis
  const [memberData, membershipData] = await Promise.all([
    redis.hgetall(`member:${user.id}`),
    redis.hgetall(`membership:${user.id}`),
  ]);
  const customAvatar = (memberData?.customAvatar as string) || null;
  const nickname = (memberData?.nickname as string) || "";
  const avatarUrl = customAvatar || user.image || null;
  const displayName = nickname.trim() || user.name || "Member";
  const isActiveMember = Number(membershipData?.expiresAt) > Date.now();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">My Profile</h1>

        {/* Profile Card */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-2 ring-zinc-200"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white">
                {getInitials(displayName)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {displayName}
              </h2>
              {nickname && (
                <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                  Full Name: {user.name}
                </p>
              )}
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
              {user.role === "admin" ? (
                <span className="mt-1 inline-block rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2.5 py-0.5 text-xs font-bold uppercase">
                  Admin
                </span>
              ) : user.role === "moderator" ? (
                <span className="mt-1 inline-block rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-xs font-bold uppercase">
                  Moderator
                </span>
              ) : isActiveMember ? (
                <span className="mt-1 inline-block rounded-full bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 px-2.5 py-0.5 text-xs font-bold uppercase">
                  Member
                </span>
              ) : (
                <span className="mt-1 inline-block rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-2.5 py-0.5 text-xs font-bold uppercase">
                  User
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Track Nickname */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Track Nickname
          </h2>
          <ProfileNicknameForm userId={user.id} initialNickname={nickname} />
        </section>

        {/* Profile Picture Upload */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Profile Picture
          </h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Upload a custom profile picture to replace your Google avatar.
          </p>
          <ProfileAvatarUpload currentAvatar={avatarUrl} userId={user.id} initials={getInitials(user.name)} />
        </section>

        {/* QR Code */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Check-in QR Code
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Present this QR code at the track to check in quickly.
          </p>

          {qrResult.success ? (
            <div className="flex flex-col items-center gap-6">
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-center">
                <img
                  src={qrResult.data}
                  alt="Member QR Code"
                  width={300}
                  height={300}
                  className="h-auto w-full max-w-[300px] mx-auto"
                />
                <p className="mt-3 text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 inline-block">
                  Member ID: {user.id}
                </p>
              </div>
              <QRDownloadButton dataUrl={qrResult.data} />
            </div>
          ) : (
            <ProfileQRError message={qrResult.error} />
          )}
        </section>

        {/* Sign Out */}
        <ThemeToggle />
        <SignOutSection />
      </div>
    </div>
  );
}
