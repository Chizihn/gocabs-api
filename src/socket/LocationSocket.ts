import { Server as SocketIOServer } from "socket.io";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface LocationUpdate {
  shuttleId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface SocketAuth {
  userId?: string;
  user?: any;
}

export function setupSocketIO(io: SocketIOServer) {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      
      if (!token) {
        // Allow anonymous connections for tracking
        (socket.data as SocketAuth) = {};
        return next();
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; walletAddress: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          walletAddress: true,
          role: true,
          isNFTHolder: true,
        },
      });

      if (user) {
        (socket.data as SocketAuth) = { userId: user.id, user };
        // Join user-specific room
        socket.join(`user:${user.id}`);
      }

      next();
    } catch (error) {
      // Allow connection even if auth fails (for anonymous users)
      (socket.data as SocketAuth) = {};
      next();
    }
  });

  io.on("connection", (socket) => {
    const auth = socket.data as SocketAuth;
    const userId = auth.userId || "anonymous";
    
    logger.info(`Client connected: ${socket.id} (User: ${userId})`);

    // Join shuttle tracking room
    socket.on("track-shuttle", (shuttleId: string) => {
      socket.join(`shuttle:${shuttleId}`);
      logger.info(`Client ${socket.id} (User: ${userId}) tracking shuttle ${shuttleId}`);
      
      // Also join user-specific tracking room
      if (auth.userId) {
        socket.join(`user:${auth.userId}:tracking:${shuttleId}`);
      }
    });

    // Driver sends location update (requires authentication)
    socket.on("location-update", async (data: LocationUpdate) => {
      if (!auth.userId || !auth.user) {
        socket.emit("error", { message: "Authentication required for location updates" });
        return;
      }

      const { shuttleId, latitude, longitude, timestamp } = data;

      // Store in Redis for quick retrieval
      await redisClient.setex(
        `shuttle:location:${shuttleId}`,
        300, // 5 minutes TTL
        JSON.stringify({ latitude, longitude, timestamp })
      );

      // Broadcast to all clients tracking this shuttle
      io.to(`shuttle:${shuttleId}`).emit("shuttle-location", {
        shuttleId,
        latitude,
        longitude,
        timestamp,
      });

      logger.info(`Location update for shuttle ${shuttleId}: ${latitude}, ${longitude}`);
    });

    // Stop tracking
    socket.on("untrack-shuttle", (shuttleId: string) => {
      socket.leave(`shuttle:${shuttleId}`);
      if (auth.userId) {
        socket.leave(`user:${auth.userId}:tracking:${shuttleId}`);
      }
      logger.info(`Client ${socket.id} stopped tracking shuttle ${shuttleId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id} (User: ${userId})`);
    });
  });

  logger.info("✅ Socket.IO configured with authentication");
}
