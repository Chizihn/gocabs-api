import { Redis } from "ioredis";
import { logger } from "../utils/logger";

export const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  }
);

redisClient.on("connect", () => {
  logger.info("✅ Redis connected");
});

redisClient.on("error", (error: unknown) => {
  logger.error("❌ Redis connection error:", error);
});
