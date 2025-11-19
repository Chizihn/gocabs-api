// src/resolvers/LocationResolver.ts
import { 
  Resolver, 
  Mutation, 
  Arg, 
  Subscription, 
  Root, 
  Authorized,
  Query,
  Ctx
} from "type-graphql";
import { PubSubEngine } from 'graphql-subscriptions';
import { Context } from "../types/Context";
import { prisma } from "../config/database";
import { LocationUpdate } from "../types/graphql/Location";
import type { CoordinatesInput } from "../types/graphql/Location";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";
import { ShuttleStatus } from "@prisma/client";

const LOCATION_UPDATE_TOPIC = "LOCATION_UPDATE";

@Resolver()
export class LocationResolver {
  @Authorized(["DRIVER"])
  @Mutation(() => Boolean)
  async updateDriverLocation(
    @Arg("shuttleId") shuttleId: string,
    @Arg("coordinates") coordinates: CoordinatesInput,
    @Ctx() { pubSub, user }: Context
  ): Promise<boolean> {
    try {
      // Verify driver owns this shuttle
      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        include: { driver: { select: { userId: true } } }
      });

      if (!shuttle || shuttle.driver?.userId !== user?.id) {
        throw new Error("Unauthorized to update this shuttle's location");
      }

      // Update in database
      await prisma.shuttle.update({
        where: { id: shuttleId },
        data: {
          currentLat: coordinates.latitude,
          currentLng: coordinates.longitude,
          status: ShuttleStatus.IN_TRANSIT,
          lastLocationUpdate: new Date()
        }
      });

      // Publish update
      const update: LocationUpdate = {
        shuttleId,
        coordinates,
        timestamp: new Date()
      };

      await pubSub.publish(LOCATION_UPDATE_TOPIC, update);
      
      // Cache in Redis
      await redisClient.setex(
        `shuttle:location:${shuttleId}`,
        300, // 5 minutes TTL
        JSON.stringify(update)
      );

      return true;
    } catch (error) {
      logger.error("Error updating driver location:", error);
      return false;
    }
  }

  @Subscription({
    topics: LOCATION_UPDATE_TOPIC,
    filter: ({ payload, args }) => 
      (payload as LocationUpdate).shuttleId === args.shuttleId
  })
  shuttleLocationUpdated(
    @Root() update: LocationUpdate,
    @Arg("shuttleId") _shuttleId: string // For filtering
  ): LocationUpdate {
    return update;
  }

  @Query(() => LocationUpdate, { nullable: true })
  async getShuttleLocation(
    @Arg("shuttleId") shuttleId: string
  ): Promise<LocationUpdate | null> {
    try {
      // Try Redis first
      const cached = await redisClient.get(`shuttle:location:${shuttleId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: { 
          id: true,
          currentLat: true,
          currentLng: true,
          lastLocationUpdate: true
        }
      });

      if (!shuttle?.currentLat || !shuttle?.currentLng) return null;

      return {
        shuttleId: shuttle.id,
        coordinates: {
          latitude: shuttle.currentLat,
          longitude: shuttle.currentLng
        },
        timestamp: shuttle.lastLocationUpdate || new Date()
      };
    } catch (error) {
      logger.error("Error getting shuttle location:", error);
      return null;
    }
  }
}