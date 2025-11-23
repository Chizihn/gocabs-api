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
  PaginatedShuttlesResponse,
  ShuttleSortInput,
  ShuttleSortField,
} from "../types/graphql/Shuttle";
import { Location } from "../types/graphql/Location";
import { prisma } from "../config/database";
import { ShuttleStatus, Prisma } from "@prisma/client";
import { logger } from "../utils/logger";
import { Context } from "../types/Context";
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";
import { GraphQLError } from "graphql";

@Resolver(() => Shuttle)
export class ShuttleResolver {
  // ====================== PUBLIC: LIST SHUTTLES ======================
  @Query(() => PaginatedShuttlesResponse)
  async shuttles(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", () => ShuttleSortInput, {
      defaultValue: {
        field: ShuttleSortField.DEPARTURE_TIME,
        direction: "asc",
      },
    })
    sort: ShuttleSortInput,
    @Arg("eventId", { nullable: true })
    eventId?: string,
    @Arg("status", () => ShuttleStatus, { nullable: true })
    status?: ShuttleStatus,
    @Arg("isFractionalized", { nullable: true }) isFractionalized?: boolean,
    @Arg("departureAfter", { nullable: true }) departureAfter?: Date
  ): Promise<PaginatedShuttlesResponse> {
    const where: Prisma.ShuttleWhereInput = {
      ...(eventId && { eventId }),
      ...(status && { status }),
      ...(isFractionalized !== undefined && { isFractionalized }),
      ...(departureAfter && { departureTime: { gte: departureAfter } }),
    };

    const { page, limit } = pagination;
    const orderBy = { [sort.field]: sort.direction };

    const [items, totalItems] = await prisma.$transaction([
      prisma.shuttle.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
        include: {
          event: true,
          vehicle: true,
          driver: { include: { user: true } },
          _count: { select: { bookings: true } },
        },
      }),
      prisma.shuttle.count({ where }),
    ]);

    return {
      items: items as any,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
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

    if (!shuttle) throw new GraphQLError("Shuttle not found");
    return shuttle as any;
  }

  // ====================== OWNER/ADMIN: CREATE SHUTTLE ======================
  @Authorized("ADMIN", "OWNER")
  @Mutation(() => Shuttle)
  async createShuttle(
    @Arg("input") input: CreateShuttleInput,
    @Ctx() { userId, userRole }: Context
  ): Promise<Shuttle> {
    // Validate event exists
    const event = await prisma.event.findUnique({
      where: { id: input.eventId },
    });
    if (!event)
      throw new GraphQLError(`Event with ID ${input.eventId} not found`);

    // For OWNER: verify vehicle belongs to them
    if (userRole === "OWNER") {
      const owner = await prisma.owner.findUnique({
        where: { userId: userId! },
      });
      if (!owner) throw new GraphQLError("Owner profile not found");

      const vehicle = await prisma.vehicle.findUnique({
        where: { id: input.vehicleId },
      });
      if (!vehicle || vehicle.ownerId !== owner.id) {
        throw new GraphQLError("You can only use vehicles you own");
      }
    }

    // Validate driver if provided
    if (input.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: input.driverId },
      });
      if (!driver)
        throw new GraphQLError(`Driver with ID ${input.driverId} not found`);
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

    return shuttle as any;
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
      include: {
        vehicle: { include: { owner: { select: { userId: true } } } },
      },
    });

    if (!shuttle) throw new GraphQLError("Shuttle not found");

    // Authorization: ADMIN can do anything
    // OWNER can update their own shuttles
    // DRIVER can only update their assigned shuttle's live location
    if (userRole !== "ADMIN") {
      if (userRole === "OWNER") {
        const owner = await prisma.owner.findUnique({
          where: { userId: userId! },
        });
        if (!owner || shuttle.vehicle.owner.userId !== owner.userId) {
          throw new GraphQLError("Not authorized to update this shuttle");
        }
      }

      if (userRole === "DRIVER") {
        const driver = await prisma.driver.findUnique({
          where: { userId: userId! },
        });
        if (!driver || shuttle.driverId !== driver.id) {
          throw new GraphQLError(
            "You can only update location of your assigned shuttle"
          );
        }
        // Drivers can only update live location fields
        const allowed = Object.keys(input).every((k) =>
          ["currentLat", "currentLng"].includes(k)
        );
        if (!allowed)
          throw new GraphQLError("Drivers can only update live location");
      }
    }

    const data: Prisma.ShuttleUpdateInput = {};

    // Map scalar/relation fields directly when provided
    if (input.driverId !== undefined) {
      data.driver = input.driverId
        ? { connect: { id: input.driverId } }
        : { disconnect: true };
    }
    if (input.departureTime !== undefined)
      data.departureTime = input.departureTime;
    if (input.arrivalTime !== undefined) data.arrivalTime = input.arrivalTime;
    if (input.basePriceUsdc !== undefined)
      data.basePriceUsdc = input.basePriceUsdc as any;
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

    return updated as any;
  }

  // ====================== OWNER/ADMIN: UPDATE STATUS ======================
  @Authorized("ADMIN", "OWNER")
  @Mutation(() => BaseResponse)
  async updateShuttleStatus(
    @Arg("id") id: string,
    @Arg("status", () => ShuttleStatus) status: ShuttleStatus,
    @Ctx() { userId, userRole }: Context
  ): Promise<BaseResponse> {
    try {
      const shuttle = await prisma.shuttle.findUnique({
        where: { id },
        include: { vehicle: { include: { owner: true } } },
      });

      if (!shuttle) {
        return { success: false, message: "Shuttle not found." };
      }

      if (userRole === "OWNER") {
        const owner = await prisma.owner.findUnique({
          where: { userId: userId! },
        });
        if (!owner || shuttle.vehicle.ownerId !== owner.id) {
          return {
            success: false,
            message: "Not authorized to update this shuttle.",
          };
        }
      }

      await prisma.shuttle.update({
        where: { id },
        data: { status },
      });

      logger.info(`Shuttle ${id} status → ${status} by ${userRole}`);
      return { success: true, message: `Shuttle status updated to ${status}.` };
    } catch (error: any) {
      logger.error(`Failed to update shuttle ${id} status:`, error);
      return {
        success: false,
        message: error.message || "Failed to update shuttle status.",
      };
    }
  }

  // ====================== DRIVER: UPDATE LIVE LOCATION ======================
  @Authorized("DRIVER")
  @Mutation(() => BaseResponse)
  async updateShuttleLocation(
    @Arg("shuttleId") shuttleId: string,
    @Arg("latitude", () => Number) latitude: number,
    @Arg("longitude", () => Number) longitude: number,
    @Ctx() { userId }: Context
  ): Promise<BaseResponse> {
    try {
      const driver = await prisma.driver.findUnique({
        where: { userId: userId! },
      });

      if (!driver)
        return { success: false, message: "Driver profile not found." };

      const shuttle = await prisma.shuttle.findFirst({
        where: { id: shuttleId, driverId: driver.id },
      });

      if (!shuttle)
        return {
          success: false,
          message: "You are not assigned to this shuttle.",
        };

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
          data: { currentLat: latitude, currentLng: longitude },
        }),
      ]);

      return { success: true, message: "Location updated successfully." };
    } catch (error: any) {
      logger.error(
        `Failed to update location for shuttle ${shuttleId}:`,
        error
      );
      return {
        success: false,
        message: error.message || "Failed to update location.",
      };
    }
  }

  // ====================== FIELD RESOLVERS ======================
  @FieldResolver(() => Int)
  availableSeats(
    @Root() shuttle: Shuttle,
    @Ctx() { prisma }: Context
  ): Promise<number> {
    // vehicle.capacity - booked seats
    return prisma.booking
      .count({
        where: {
          shuttleId: shuttle.id,
          status: { in: ["CONFIRMED", "PICKED_UP"] },
        },
      })
      .then((booked) => shuttle.vehicle.capacity - booked);
  }

  @FieldResolver(() => Location)
  pickupLocation(@Root() shuttle: Shuttle): Location {
    const loc = shuttle.pickupLocation as any;
    return {
      lat: loc?.lat ?? 0,
      lng: loc?.lng ?? 0,
      name: loc?.name ?? "Unknown Pickup",
    };
  }

  @FieldResolver(() => Location)
  dropoffLocation(@Root() shuttle: Shuttle): Location {
    const loc = shuttle.dropoffLocation as any;
    return {
      lat: loc?.lat ?? 0,
      lng: loc?.lng ?? 0,
      name: loc?.name ?? "Unknown Dropoff",
    };
  }
}
