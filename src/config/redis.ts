import { Redis } from "ioredis";
import { logger } from "../utils/logger";

// Add retry strategy
const MAX_RETRIES = 5;
let retryCount = 0;

export const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (retryCount >= MAX_RETRIES) {
      logger.error("Max Redis reconnection attempts reached");
      return null; // Stop retrying after max retries
    }
    retryCount++;
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis reconnecting (attempt ${retryCount}/${MAX_RETRIES})...`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true; // Reconnect on READONLY error
    }
    return false;
  },
  enableOfflineQueue: false, // Don't queue commands when Redis is down
  autoResubscribe: false, // Don't resubscribe on reconnection
});

redisClient.on("connect", () => {
  logger.info("✅ Redis connected");
  retryCount = 0; // Reset retry counter on successful connection
});

redisClient.on("error", (error: Error) => {
  logger.error("❌ Redis error:", error.message);
  // Consider implementing a circuit breaker pattern here
});

// Handle process termination
process.on("SIGINT", async () => {
  try {
    await redisClient.quit();
    logger.info("Redis connection closed through app termination");
    process.exit(0);
  } catch (error) {
    logger.error("Error closing Redis connection:", error);
    process.exit(1);
  }
});