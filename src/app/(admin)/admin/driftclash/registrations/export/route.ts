import { auth } from "@/lib/auth";
import { listRegistrations, registrationsToCsv } from "@/lib/driftclash-registrations";

export const dynamic = "force-dynamic";

/** Every registration as a spreadsheet, one row per car. Admins only. */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const csv = registrationsToCsv(await listRegistrations());
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="driftclash-registrations-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
