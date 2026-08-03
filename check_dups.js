const { Redis } = require("@upstash/redis");
require("dotenv").config({ path: ".env.local" });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function run() {
  const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
  const checkins = records.map(r => typeof r === "string" ? JSON.parse(r) : r).filter(r => r && r.type === "checkin");
  console.log("Total checkins:", checkins.length);
  
  const byMemberDate = new Map();
  for (const c of checkins) {
    const date = new Date(c.timestamp).toISOString().split("T")[0];
    const key = c.memberId + "_" + date;
    if (!byMemberDate.has(key)) byMemberDate.set(key, []);
    byMemberDate.get(key).push(c);
  }
  
  let dups = 0;
  for (const [k, v] of byMemberDate) {
    if (v.length > 1) {
      console.log(`\nDuplicates for ${k}:`);
      for (const c of v) {
         console.log(`- ${c.description}`);
      }
      dups++;
    }
  }
  console.log(`\nFound ${dups} members with duplicate checkins.`);
}
run().catch(console.error);
