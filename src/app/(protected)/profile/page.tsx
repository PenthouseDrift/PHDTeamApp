import { auth } from "@/lib/auth";
import { getOrCreateQRCode } from "@/actions/qr";
import { QRDownloadButton } from "@/components/QRDownloadButton";
import { ProfileQRError } from "./ProfileQRError";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const { user } = session;
  const qrResult = await getOrCreateQRCode(user.id);

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-white">My Profile</h1>

        {/* Profile Info */}
        <section className="rounded-xl bg-zinc-900 p-6">
          <div className="flex items-center gap-4">
            {user.image && (
              <img
                src={user.image}
                alt=""
                className="h-16 w-16 rounded-full ring-2 ring-zinc-700"
              />
            )}
            <div>
              <h2 className="text-lg font-semibold text-white">
                {user.name ?? "Member"}
              </h2>
              <p className="text-sm text-zinc-400">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300 capitalize">
                {user.role}
              </span>
            </div>
          </div>
        </section>

        {/* QR Code */}
        <section className="rounded-xl bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Check-in QR Code
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            Present this QR code at the track to check in quickly.
          </p>

          {qrResult.success ? (
            <div className="flex flex-col items-center gap-6">
              <div className="rounded-xl bg-white p-4">
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
      </div>
    </div>
  );
}
