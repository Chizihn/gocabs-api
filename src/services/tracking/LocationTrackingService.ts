import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../../config/database";
import { redisClient } from "../../config/redis";
import { logger } from "../../utils/logger";
import { pubSub } from "../../config/pubsub"; // 1. Import pubSub

interface LocationUpdate {
  shuttleId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

const LOCATION_UPDATE_TOPIC = "LOCATION_UPDATE"; // 2. Define the topic

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
        JSON.stringify({
          shuttleId,
          coordinates: { latitude, longitude },
          timestamp,
        })
      );

      // Update database using the correct fields
      await prisma.shuttle.update({
        where: { id: shuttleId },
        data: {
          currentLat: latitude,
          currentLng: longitude,
          lastLocationUpdate: new Date(),
          status: "IN_TRANSIT",
        },
      });

      // Broadcast to all clients tracking this shuttle
      this.io.to(`shuttle:${shuttleId}`).emit("shuttle-location", {
        shuttleId,
        coordinates: { latitude, longitude },
        timestamp,
      });

      // 3. Publish to GraphQL Subscription
      await pubSub.publish(LOCATION_UPDATE_TOPIC, {
        shuttleId,
        coordinates: { latitude, longitude },
        timestamp,
      });

      logger.debug(`Location updated for shuttle ${shuttleId}`);
    } catch (error) {
      logger.error("Failed to handle location update:", error);
      throw error; // Re-throw to handle it in the caller
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
          coordinates: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          timestamp: location.timestamp,
        });
        return;
      }

      // Fallback to database
      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: {
          id: true,
          currentLat: true,
          currentLng: true,
          lastLocationUpdate: true,
        },
      });

      if (shuttle?.currentLat && shuttle?.currentLng) {
        socket.emit("shuttle-location", {
          shuttleId: shuttle.id,
          coordinates: {
            latitude: shuttle.currentLat,
            longitude: shuttle.currentLng,
          },
          timestamp: shuttle.lastLocationUpdate?.getTime() || Date.now(),
        });
      }
    } catch (error) {
      logger.error("Failed to send last known location:", error);
    }
  }

  async getShuttleLocation(shuttleId: string): Promise<{
    coordinates: { latitude: number; longitude: number };
    timestamp: number;
  } | null> {
    try {
      const cached = await redisClient.get(`shuttle:location:${shuttleId}`);

      if (cached) {
        const location = JSON.parse(cached);
        return {
          coordinates: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          timestamp: location.timestamp,
        };
      }

      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: {
          currentLat: true,
          currentLng: true,
          lastLocationUpdate: true,
        },
      });

      if (!shuttle?.currentLat || !shuttle?.currentLng) return null;

      return {
        coordinates: {
          latitude: shuttle.currentLat,
          longitude: shuttle.currentLng,
        },
        timestamp: shuttle.lastLocationUpdate?.getTime() || Date.now(),
      };
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
    try {
      // Get all active shuttles with location data
      const shuttles = await prisma.shuttle.findMany({
        where: {
          status: { in: ["SCHEDULED", "BOARDING", "IN_TRANSIT"] },
          currentLat: { not: null },
          currentLng: { not: null },
        },
        include: {
          vehicle: true,
          _count: {
            select: {
              bookings: {
                where: { status: { in: ["CONFIRMED", "PICKED_UP"] } },
              },
            },
          },
        },
      });

      // Filter by distance and map to response format
      return shuttles
        .filter((shuttle) => {
          if (shuttle.currentLat === null || shuttle.currentLng === null)
            return false;

          const distance = this.calculateDistance(
            latitude,
            longitude,
            shuttle.currentLat,
            shuttle.currentLng
          );

          return distance <= radiusKm;
        })
        .map((shuttle) => {
          const bookedSeats = shuttle._count.bookings;
          const availableSeats = shuttle.vehicle.capacity - bookedSeats;
          return {
            id: shuttle.id,
            licensePlate: shuttle.vehicle.licensePlate,
            currentLat: shuttle.currentLat,
            currentLng: shuttle.currentLng,
            vehicleType: shuttle.vehicle.vehicleType,
            capacity: shuttle.vehicle.capacity,
            availableSeats: availableSeats,
            distance: this.calculateDistance(
              latitude,
              longitude,
              shuttle.currentLat!,
              shuttle.currentLng!
            ),
          };
        });
    } catch (error) {
      logger.error("Error finding nearby shuttles:", error);
      throw new Error("Failed to find nearby shuttles");
    }
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
