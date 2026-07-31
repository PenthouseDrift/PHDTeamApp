import { redis } from "./src/lib/redis";

async function test() {
  const before = await redis.get("settings:self_checkin_active");
  console.log("before:", before, typeof before);
  
  await redis.set("settings:self_checkin_active", "true");
  
  const after = await redis.get("settings:self_checkin_active");
  console.log("after:", after, typeof after);
}

test().catch(console.error);
