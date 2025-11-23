import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      // log: ["query", "info", "warn", "error"],
    });
  }
  prisma = global.__prisma;
}

prisma
  .$connect()
  .then(() => {
    // logger.info("✅ Database connected successfully");
  })
  .catch((error: unknown) => {
    logger.error("❌ Database connection failed:", error);
    process.exit(1);
  });

export { prisma };
