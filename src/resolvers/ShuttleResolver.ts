import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Authorized,
  FieldResolver,
  Root,
} from "type-graphql";
import { Shuttle, CreateShuttleInput, UpdateShuttleInput } from "../types/graphql/Shuttle";
import { prisma } from "../config/database";
import { ShuttleStatus, Prisma } from "@prisma/client";
import { logger } from "../utils/logger";

@Resolver(() => Shuttle)
export class ShuttleResolver {
  @Query(() => [Shuttle])
  async shuttles(
    @Arg("eventId", { nullable: true }) eventId?: string,
    @Arg("status", () => ShuttleStatus, { nullable: true })
    status?: ShuttleStatus,
    @Arg("isFractionalized", { nullable: true })
    isFractionalized?: boolean,
    @Arg("minAvailableSeats", { nullable: true })
    minAvailableSeats?: number,
    @Arg("departureAfter", { nullable: true })
    departureAfter?: Date
  ): Promise<Shuttle[]> {
    const where: any = {};
    
    if (eventId) where.eventId = eventId;
    if (status) where.status = status;
    if (isFractionalized !== undefined) where.isFractionalized = isFractionalized;
    if (minAvailableSeats !== undefined) where.availableSeats = { gte: minAvailableSeats };
    if (departureAfter) where.departureTime = { gte: departureAfter };

    return prisma.shuttle.findMany({
      where,
      include: {
        event: true,
        driver: {
          include: { 
            user: true 
          },
        },
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: { departureTime: "asc" },
    }) as unknown as Shuttle[];
  }

  @Query(() => Shuttle, { nullable: true })
  async shuttle(@Arg("id") id: string): Promise<Shuttle | null> {
    return (await prisma.shuttle.findUnique({
      where: { id },
      include: {
        event: true,
        driver: { 
          include: { 
            user: true 
          } 
        },
        bookings: true,
        stakedNFTs: {
          include: {
            user: {
              include: {
                owner: true
              }
            }
          }
        },
        _count: {
          select: { 
            bookings: true,
            stakedNFTs: true 
          },
        },
      },
    })) as unknown as Shuttle | null;
  }

  @Authorized("ADMIN", "OWNER")
  @Mutation(() => Shuttle)
  async createShuttle(
    @Arg("input") input: CreateShuttleInput
  ): Promise<Shuttle> {
    // Validate that the event exists
    const event = await prisma.event.findUnique({
      where: { id: input.eventId },
    });

    if (!event) {
      throw new Error(`Event with ID ${input.eventId} not found`);
    }

    // If driverId is provided, validate the driver exists
    let driverId = null;
    if (input.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: input.driverId },
      });
      if (!driver) {
        throw new Error(`Driver with ID ${input.driverId} not found`);
      }
      driverId = input.driverId;
    }

    const shuttle = await prisma.shuttle.create({
      data: {
        eventId: input.eventId,
        licensePlate: input.licensePlate,
        vehicleType: input.vehicleType,
        capacity: input.capacity,
        availableSeats: input.capacity, // Initialize availableSeats to capacity
        driverId: driverId,
        departureTime: input.departureTime,
        arrivalTime: input.arrivalTime,
        pickupLocation: input.pickupLocation as Prisma.InputJsonValue,
        dropoffLocation: input.dropoffLocation as Prisma.InputJsonValue,
        basePriceUsdc: input.basePriceUsdc,
        status: ShuttleStatus.SCHEDULED,
        isFractionalized: input.isFractionalized ?? false,
        currentLat: null,
        currentLng: null,
        lastLocationUpdate: null,
      },
      include: {
        event: true,
        driver: { 
          include: { 
            user: true 
          } 
        },
        bookings: true,
      },
    });

    logger.info(`Created shuttle ${shuttle.id} for event ${input.eventId}`);
    return shuttle as unknown as Shuttle;
  }

  @Authorized("ADMIN", "OWNER", "DRIVER")
  @Mutation(() => Shuttle)
  async updateShuttle(
    @Arg("id") id: string,
    @Arg("input") input: UpdateShuttleInput
  ): Promise<Shuttle> {
    // Check if shuttle exists
    const existingShuttle = await prisma.shuttle.findUnique({
      where: { id },
    });

    if (!existingShuttle) {
      throw new Error(`Shuttle with ID ${id} not found`);
    }

    // If updating driver, validate the driver exists
    if (input.driverId !== undefined) {
      if (input.driverId) {
        const driver = await prisma.driver.findUnique({
          where: { id: input.driverId },
        });
        if (!driver) {
          throw new Error(`Driver with ID ${input.driverId} not found`);
        }
      }
    }

    // Prepare update data
    const updateData: any = { ...input };
    
    // Handle JSON fields
    if (input.pickupLocation) {
      updateData.pickupLocation = input.pickupLocation as Prisma.InputJsonValue;
    }
    
    if (input.dropoffLocation) {
      updateData.dropoffLocation = input.dropoffLocation as Prisma.InputJsonValue;
    }

    // Update lastLocationUpdate if lat/lng is being updated
    if (input.currentLat !== undefined || input.currentLng !== undefined) {
      updateData.lastLocationUpdate = new Date();
    }

    // If capacity is being updated, ensure availableSeats is also updated if needed
    if (input.capacity !== undefined) {
      if (input.capacity < existingShuttle.capacity - existingShuttle.availableSeats) {
        throw new Error('Cannot reduce capacity below the number of booked seats');
      }
      updateData.availableSeats = input.capacity - (existingShuttle.capacity - existingShuttle.availableSeats);
    }

    const shuttle = await prisma.shuttle.update({
      where: { id },
      data: updateData,
      include: {
        event: true,
        driver: { 
          include: { 
            user: true 
          } 
        },
        bookings: true,
      },
    });

    logger.info(`Updated shuttle ${id}`);
    return shuttle as unknown as Shuttle;
  }

  @Authorized("ADMIN", "OWNER", "DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleStatus(
    @Arg("id") id: string,
    @Arg("status", () => ShuttleStatus) status: ShuttleStatus
  ): Promise<boolean> {
    await prisma.shuttle.update({
      where: { id },
      data: { status },
    });
    logger.info(`Shuttle ${id} status changed to ${status}`);
    return true;
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleLocation(
    @Arg("id") id: string,
    @Arg("latitude") latitude: number,
    @Arg("longitude") longitude: number
  ): Promise<boolean> {
    await prisma.shuttle.update({
      where: { id },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        lastLocationUpdate: new Date(),
      },
    });
    return true;
  }

  @FieldResolver(() => Number)
  availableSeats(@Root() shuttle: Shuttle): number {
    return shuttle.availableSeats ?? 0;
  }
}
