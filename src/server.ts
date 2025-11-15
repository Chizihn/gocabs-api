import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createApp } from './app';
import { logger } from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  // Initialize Prisma and Redis clients
  const prisma = new PrismaClient();
  const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Shutting down gracefully');
    await prisma.$disconnect();
    redisClient.quit();
    process.exit(0);
  });

  try {
    // Create and configure the Express app
    const { app, httpServer } = await createApp(prisma, redisClient);

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
      logger.info(`🔌 WebSocket server ready at ws://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    await prisma.$disconnect();
    redisClient.quit();
    process.exit(1);
  }
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
