import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { redis } = await import("../src/lib/redis");
  const { getMemberIds } = await import("../src/lib/member-roster");
  const wanted = (process.argv[2] ?? "").trim().toLowerCase();
  const ids = await getMemberIds();
  const matches: Array<{ id: string; email: string; name: string; cupsWon: unknown }> = [];
  const near: string[] = [];
  for (const id of ids) {
    const row = await redis.hmget<Record<string, unknown>>(`member:${id}`, "email", "name", "nickname");
    const email = String(row?.email ?? "").toLowerCase();
    if (!email) continue;
    if (email === wanted) {
      const stats = await redis.hmget<Record<string, unknown>>(`tcg:clash:stats:${id}`, "cupsWon", "wins", "gameXp");
      matches.push({ id, email, name: String(row?.nickname || row?.name || ""), cupsWon: stats?.cupsWon ?? 0 });
    } else if (email.includes("ashley")) near.push(email);
  }
  console.log("members scanned:", ids.length);
  console.log("exact matches:", matches);
  if (matches.length === 0) console.log("similar emails:", near);
}
main().catch((e) => { console.error(e); process.exit(1); });
