import 'reflect-metadata';
import express, { Express, Request, Response, NextFunction } from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { json } from 'body-parser';
import cors from 'cors';
import http, { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { buildSchema } from 'type-graphql';
import { errorHandler } from './middleware/errorHandler';
import { setupLocationSocket } from './socket/LocationSocket';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { generalRateLimiter } from './middleware/graphqlRateLimits';
import { UserResolver } from './resolvers/UserResolver';
import { EventResolver } from './resolvers/EventResolver';
import { ShuttleResolver } from './resolvers/ShuttleResolver';
import { BookingResolver } from './resolvers/BookingResolver';
import { StakingResolver } from './resolvers/StakingResolver';
import { RewardResolver } from './resolvers/RewardResolver';
import { FleetAuthResolver } from './resolvers/FleetAuthResolver';
import { DriverResolver } from './resolvers/DriverResolver';
import { OwnerResolver } from './resolvers/OwnerResolver';
import { NotificationResolver } from './resolvers/NotificationResolver';
import { AdminResolver } from './resolvers/AdminResolver';
import { pubSub } from './config/pubsub';

export async function createApp(prisma: PrismaClient, redisClient: Redis) {
  const app: Express = express();
  const httpServer: HttpServer = http.createServer(app);
  
  // Configure CORS for Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Apply middleware
  app.use(cors());
  app.use(express.json());
  app.use(authMiddleware);

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  try {
    // Build GraphQL schema
    const schema = await buildSchema({
      resolvers: [
        UserResolver,
        EventResolver,
        ShuttleResolver,
        BookingResolver,
        StakingResolver,
        RewardResolver,
        FleetAuthResolver,
        DriverResolver,
        OwnerResolver,
        NotificationResolver,
        AdminResolver,
      ],
      globalMiddlewares: [generalRateLimiter],
      authChecker: ({ context }, roles) => {
        const { user } = context;
        if (!user) return false;

        if (roles.includes('NFT_HOLDER')) {
          return user.isNFTHolder;
        }

        if (roles.length === 0) return true;
        return roles.includes(user.role);
      },
      validate: true,
    });

    // Create Apollo Server
    const server = new ApolloServer({
      schema,
      plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
      formatError: (error) => {
        logger.error('GraphQL Error:', error);
        return error;
      },
    });

    // Start Apollo Server
    await server.start();

    // Apply GraphQL middleware
    app.use(
      '/graphql',
      json(),
              expressMiddleware(server, {
                context: async ({ req, res }) => {
                  const user = (req as any).user;
                  const userId = user?.id || null;
                  const userRole = user?.role || null;
                  let ownerId: string | null = null;
      
                  if (userRole === "OWNER" && userId) {
                    const owner = await prisma.owner.findUnique({
                      where: { userId: userId },
                      select: { id: true },
                    });
                    ownerId = owner?.id || null;
                  }
      
                  return {
                    req,
                    res,
                    user,
                    userId,
                    userRole,
                    ownerId,
                    prisma,
                    redisClient,
                    pubSub,
                  };
                },
              })    );

    // Setup Socket.IO for real-time tracking
    setupLocationSocket(io);

    // Error handling
    app.use(errorHandler);

    return { app, httpServer, io };
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    throw error;
  }
}
