import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Authorized,
  FieldResolver,
  Root,
  Ctx,
  Int,
} from "type-graphql";
import {
  Shuttle,
  CreateShuttleInput,
  UpdateShuttleInput,
} from "../types/graphql/Shuttle";
import { Location } from "../types/graphql/Location";
import { prisma } from "../config/database";
import { ShuttleStatus, Prisma } from "@prisma/client";
import { logger } from "../utils/logger";
import { Context } from "../types/Context";

@Resolver(() => Shuttle)
export class ShuttleResolver {
  // ====================== PUBLIC: LIST SHUTTLES ======================
  @Query(() => [Shuttle])
  async shuttles(
    @Arg("eventId", { nullable: true }) eventId?: string,
    @Arg("status", () => ShuttleStatus, { nullable: true }) status?: ShuttleStatus,
    @Arg("isFractionalized", { nullable: true }) isFractionalized?: boolean,
    @Arg("departureAfter", { nullable: true }) departureAfter?: Date
  ): Promise<Shuttle[]> {
    const where: Prisma.ShuttleWhereInput = {
      ...(eventId && { eventId }),
      ...(status && { status }),
      ...(isFractionalized !== undefined && { isFractionalized }),
      ...(departureAfter && { departureTime: { gte: departureAfter } }),
    };

    const shuttles = await prisma.shuttle.findMany({
      where,
      include: {
        event: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: true,
        stakedNFTs: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { departureTime: "asc" },
    });

    return shuttles as unknown as Shuttle[];
  }

  // ====================== PUBLIC: GET SINGLE SHUTTLE ======================
  @Query(() => Shuttle, { nullable: true })
  async shuttle(@Arg("id") id: string): Promise<Shuttle | null> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id },
      include: {
        event: true,
        vehicle: { include: { owner: true } },
        driver: { include: { user: true } },
        bookings: { include: { user: true } },
        stakedNFTs: { include: { user: true } },
        _count: { select: { bookings: true, stakedNFTs: true } },
      },
    });

    return shuttle as unknown as Shuttle | null;
  }

  // ====================== OWNER/ADMIN: CREATE SHUTTLE ======================
  @Authorized("ADMIN", "OWNER")
  @Mutation(() => Shuttle)
  async createShuttle(
    @Arg("input") input: CreateShuttleInput,
    @Ctx() { userId, userRole }: Context
  ): Promise<Shuttle> {
    // Validate event exists
    const event = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!event) throw new Error(`Event with ID ${input.eventId} not found`);

    // For OWNER: verify vehicle belongs to them
    if (userRole === "OWNER") {
      const owner = await prisma.owner.findUnique({ where: { userId: userId! } });
      if (!owner) throw new Error("Owner profile not found");

      const vehicle = await prisma.vehicle.findUnique({
        where: { id: input.vehicleId },
      });
      if (!vehicle || vehicle.ownerId !== owner.id) {
        throw new Error("You can only use vehicles you own");
      }
    }

    // Validate driver if provided
    if (input.driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: input.driverId } });
      if (!driver) throw new Error(`Driver with ID ${input.driverId} not found`);
    }

    const shuttle = await prisma.shuttle.create({
      data: {
        eventId: input.eventId,
        vehicleId: input.vehicleId,
        driverId: input.driverId || null,
        departureTime: input.departureTime,
        arrivalTime: input.arrivalTime,
        pickupLocation: input.pickupLocation as any,
        dropoffLocation: input.dropoffLocation as any,
        basePriceUsdc: input.basePriceUsdc,
        isFractionalized: input.isFractionalized || false,
        status: ShuttleStatus.SCHEDULED,
      },
      include: {
        event: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: true,
      },
    });

    return shuttle as unknown as Shuttle;
  }

  // ====================== OWNER/ADMIN/DRIVER: UPDATE SHUTTLE ======================
  @Authorized("ADMIN", "OWNER", "DRIVER")
  @Mutation(() => Shuttle)
  async updateShuttle(
    @Arg("id") id: string,
    @Arg("input") input: UpdateShuttleInput,
    @Ctx() { userId, userRole }: Context
  ): Promise<Shuttle> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id },
      include: { vehicle: { include: { owner: { select: { userId: true } } } } },
    });

    if (!shuttle) throw new Error("Shuttle not found");

    // Authorization: ADMIN can do anything
    // OWNER can update their own shuttles
    // DRIVER can only update their assigned shuttle's live location
    if (userRole !== "ADMIN") {
      if (userRole === "OWNER") {
        const owner = await prisma.owner.findUnique({ where: { userId: userId! } });
        if (!owner || shuttle.vehicle.owner.userId !== owner.userId) {
          throw new Error("Not authorized to update this shuttle");
        }
      }

      if (userRole === "DRIVER") {
        const driver = await prisma.driver.findUnique({ where: { userId: userId! } });
        if (!driver || shuttle.driverId !== driver.id) {
          throw new Error("You can only update location of your assigned shuttle");
        }
        // Drivers can only update live location fields
        const allowed = Object.keys(input).every((k) =>
          ["currentLat", "currentLng"].includes(k)
        );
        if (!allowed) throw new Error("Drivers can only update live location");
      }
    }

    const data: Prisma.ShuttleUpdateInput = {};

    // Map scalar/relation fields directly when provided
    if (input.driverId !== undefined) {
      data.driver = input.driverId
        ? { connect: { id: input.driverId } }
        : { disconnect: true };
    }
    if (input.departureTime !== undefined) data.departureTime = input.departureTime;
    if (input.arrivalTime !== undefined) data.arrivalTime = input.arrivalTime;
    if (input.basePriceUsdc !== undefined) data.basePriceUsdc = input.basePriceUsdc as any;
    if (input.status !== undefined) data.status = input.status;
    if (input.isFractionalized !== undefined)
      data.isFractionalized = input.isFractionalized;

    // JSON fields
    if (input.pickupLocation !== undefined)
      data.pickupLocation = input.pickupLocation as any;
    if (input.dropoffLocation !== undefined)
      data.dropoffLocation = input.dropoffLocation as any;

    // Live location fields
    if (input.currentLat !== undefined) data.currentLat = input.currentLat;
    if (input.currentLng !== undefined) data.currentLng = input.currentLng;
    if (input.lastLocationUpdate !== undefined)
      data.lastLocationUpdate = input.lastLocationUpdate;

    // Auto-update lastLocationUpdate when location changes
    if (input.currentLat !== undefined || input.currentLng !== undefined) {
      data.lastLocationUpdate = new Date();
    }

    const updated = await prisma.shuttle.update({
      where: { id },
      data,
      include: {
        event: true,
        vehicle: true,
        driver: { include: { user: true } },
        bookings: true,
      },
    });

    return updated as unknown as Shuttle;
  }

  // ====================== OWNER/ADMIN: UPDATE STATUS ======================
  @Authorized("ADMIN", "OWNER")
  @Mutation(() => Boolean)
  async updateShuttleStatus(
    @Arg("id") id: string,
    @Arg("status", () => ShuttleStatus) status: ShuttleStatus,
    @Ctx() { userId, userRole }: Context
  ): Promise<boolean> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id },
      include: { vehicle: { include: { owner: true } } },
    });

    if (!shuttle) throw new Error("Shuttle not found");

    if (userRole === "OWNER") {
      const owner = await prisma.owner.findUnique({ where: { userId: userId! } });
      if (!owner || shuttle.vehicle.ownerId !== owner.id) {
        throw new Error("Not authorized");
      }
    }

    await prisma.shuttle.update({
      where: { id },
      data: { status },
    });

    logger.info(`Shuttle ${id} status → ${status} by ${userRole}`);
    return true;
  }

  // ====================== DRIVER: UPDATE LIVE LOCATION ======================
  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleLocation(
    @Arg("shuttleId") shuttleId: string,
    @Arg("latitude", () => Number) latitude: number,
    @Arg("longitude", () => Number) longitude: number,
    @Ctx() { userId }: Context
  ): Promise<boolean> {
    const driver = await prisma.driver.findUnique({
      where: { userId: userId! },
    });

    if (!driver) throw new Error("Driver not found");

    const shuttle = await prisma.shuttle.findFirst({
      where: { id: shuttleId, driverId: driver.id },
    });

    if (!shuttle) throw new Error("You are not assigned to this shuttle");

    const now = new Date();

    await prisma.$transaction([
      prisma.shuttle.update({
        where: { id: shuttleId },
        data: {
          currentLat: latitude,
          currentLng: longitude,
          lastLocationUpdate: now,
        },
      }),
      prisma.driver.update({
        where: { id: driver.id },
        data: {
          currentLat: latitude,
          currentLng: longitude,
        },
      }),
    ]);

    return true;
  }

  // ====================== FIELD RESOLVERS ======================
  @FieldResolver(() => Int)
  availableSeats(@Root() shuttle: Shuttle, @Ctx() { prisma }: Context): Promise<number> {
    // vehicle.capacity - booked seats
    return prisma.booking
      .count({ where: { shuttleId: shuttle.id, status: { in: ["CONFIRMED", "PICKED_UP"] } } })
      .then((booked) => shuttle.vehicle.capacity - booked);
  }

  @FieldResolver(() => Location)
  pickupLocation(@Root() shuttle: Shuttle): Location {
    return shuttle.pickupLocation as Location;
  }

  @FieldResolver(() => Location)
  dropoffLocation(@Root() shuttle: Shuttle): Location {
    return shuttle.dropoffLocation as Location;
  }
}