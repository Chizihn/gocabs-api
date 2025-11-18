// src/socket/LocationSocket.ts
import { Server as SocketIOServer } from "socket.io";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";
import { prisma } from "../config/database";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface LocationUpdate {
  shuttleId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export function setupLocationSocket(io: SocketIOServer) {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || 
                   socket.handshake.headers?.authorization?.replace("Bearer ", "");
      
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, role: true },
        });
        (socket as any).user = user;
      }
      next();
    } catch (error) {
      logger.warn(`Socket auth failed for ${socket.id}:`, error);
      // Allow connection but mark as unauthenticated
      (socket as any).user = null;
      next();
    }
  });

  io.on("connection", (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    // Track shuttle (for passengers/seekers)
    socket.on("track-shuttle", async (shuttleId: string) => {
      try {
        await socket.join(`shuttle:${shuttleId}`);
        logger.info(`Client ${socket.id} tracking shuttle ${shuttleId}`);

        // Send last known location
        const cached = await redisClient.get(`shuttle:location:${shuttleId}`);
        if (cached) {
          const location = JSON.parse(cached);
          socket.emit("shuttle-location", {
            shuttleId,
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude
            },
            timestamp: location.timestamp,
          });
        } else {
          // Fallback to database
          const shuttle = await prisma.shuttle.findUnique({
            where: { id: shuttleId },
            select: { 
              id: true,
              currentLat: true,
              currentLng: true,
              lastLocationUpdate: true
            },
          });
          if (shuttle?.currentLat && shuttle?.currentLng) {
            socket.emit("shuttle-location", {
              shuttleId: shuttle.id,
              coordinates: {
                latitude: shuttle.currentLat,
                longitude: shuttle.currentLng
              },
              timestamp: shuttle.lastLocationUpdate?.getTime() || Date.now(),
            });
          }
        }
      } catch (error) {
        logger.error("Track shuttle error:", error);
      }
    });

    // Handle driver location updates
    socket.on("location-update", async (data: LocationUpdate) => {
      try {
        const { shuttleId, latitude, longitude, timestamp } = data;
        
        // Verify driver owns this shuttle
        const shuttle = await prisma.shuttle.findUnique({
          where: { id: shuttleId },
          include: {
            driver: {
              select: {
                id: true,
                userId: true
              }
            }
          },
        });

        const userId = (socket as any).user?.id;
        if (!userId || (shuttle?.driver?.userId !== userId && shuttle?.driver?.id !== userId)) {
          socket.emit("error", { message: "Unauthorized to update location" });
          return;
        }

        // Store in Redis
        await redisClient.setex(
          `shuttle:location:${shuttleId}`,
          300, // 5 minutes TTL
          JSON.stringify({ latitude, longitude, timestamp })
        );

        // Update in database
        await prisma.shuttle.update({
          where: { id: shuttleId },
          data: {
            currentLat: latitude,
            currentLng: longitude,
            lastLocationUpdate: new Date(),
            status: 'IN_TRANSIT'
          }
        });

        // Broadcast to all clients tracking this shuttle
        io.to(`shuttle:${shuttleId}`).emit("shuttle-location", {
          shuttleId,
          coordinates: {
            latitude,
            longitude
          },
          longitude,
          timestamp,
        });

        logger.debug(`Location updated for shuttle ${shuttleId}`);
      } catch (error) {
        logger.error("WebSocket location update error:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // Stop tracking shuttle
    socket.on("untrack-shuttle", (shuttleId: string) => {
      socket.leave(`shuttle:${shuttleId}`);
      logger.info(`Client ${socket.id} stopped tracking shuttle ${shuttleId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
}