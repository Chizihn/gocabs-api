import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../../config/database";
import { redisClient } from "../../config/redis";
import { logger } from "../../utils/logger";
import { Shuttle } from "../../types/graphql/Shuttle";

interface LocationUpdate {
  shuttleId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export class LocationTrackingService {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Track shuttle
      socket.on("track-shuttle", (shuttleId: string) => {
        socket.join(`shuttle:${shuttleId}`);
        logger.info(`Client ${socket.id} tracking shuttle ${shuttleId}`);

        // Send last known location
        this.sendLastKnownLocation(socket, shuttleId);
      });

      // Driver sends location update
      socket.on("location-update", async (data: LocationUpdate) => {
        await this.handleLocationUpdate(data);
      });

      // Stop tracking
      socket.on("untrack-shuttle", (shuttleId: string) => {
        socket.leave(`shuttle:${shuttleId}`);
        logger.info(
          `Client ${socket.id} stopped tracking shuttle ${shuttleId}`
        );
      });

      socket.on("disconnect", () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  private async handleLocationUpdate(data: LocationUpdate) {
    const { shuttleId, latitude, longitude, timestamp } = data;

    try {
      // Store in Redis for quick retrieval
      await redisClient.setex(
        `shuttle:location:${shuttleId}`,
        300, // 5 minutes TTL
        JSON.stringify({ latitude, longitude, timestamp })
      );

      // Update database
      await prisma.shuttle.update({
        where: { id: shuttleId },
        data: {
          currentLocation: { latitude, longitude },
        },
      });

      // Broadcast to all clients tracking this shuttle
      this.io.to(`shuttle:${shuttleId}`).emit("shuttle-location", {
        shuttleId,
        latitude,
        longitude,
        timestamp,
      });

      logger.debug(`Location updated for shuttle ${shuttleId}`);
    } catch (error) {
      logger.error("Failed to handle location update:", error);
    }
  }

  private async sendLastKnownLocation(socket: any, shuttleId: string) {
    try {
      // Try Redis first
      const cached = await redisClient.get(`shuttle:location:${shuttleId}`);

      if (cached) {
        const location = JSON.parse(cached);
        socket.emit("shuttle-location", {
          shuttleId,
          ...location,
        });
        return;
      }

      // Fallback to database
      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: { currentLocation: true },
      });

      if (shuttle?.currentLocation) {
        socket.emit("shuttle-location", {
          shuttleId,
          ...(shuttle.currentLocation as any),
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      logger.error("Failed to send last known location:", error);
    }
  }

  async getShuttleLocation(shuttleId: string): Promise<any> {
    try {
      const cached = await redisClient.get(`shuttle:location:${shuttleId}`);

      if (cached) {
        return JSON.parse(cached);
      }

      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: { currentLocation: true },
      });

      return shuttle?.currentLocation;
    } catch (error) {
      logger.error("Failed to get shuttle location:", error);
      return null;
    }
  }

  async getNearbyShuttles(
    latitude: number,
    longitude: number,
    radiusKm: number = 5
  ) {
    // Get all active shuttles
    const shuttles = await prisma.shuttle.findMany({
      where: {
        status: { in: ["SCHEDULED", "BOARDING", "IN_TRANSIT"] },
        currentLocation: { not: {} }, // Empty object to check for non-null JSON
      },
      select: {
        id: true,
        vehicleNumber: true,
        currentLocation: true,
      },
    });

    // Filter by distance
    const nearbyShuttles = shuttles.filter((shuttle: { id: string; vehicleNumber: string; currentLocation: any }) => {
      if (!shuttle.currentLocation) return false;

      const location = shuttle.currentLocation as any;
      const distance = this.calculateDistance(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      );

      return distance <= radiusKm;
    });

    return nearbyShuttles;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
