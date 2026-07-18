import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  retry: {
    retries: 5,
    backoff: (retryCount) =>
      Math.min(1000 * Math.pow(2, retryCount), 30000),
  },
});
