import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  FieldResolver,
  Root,
  registerEnumType,
} from "type-graphql";
import { prisma } from "../config/database";
import { Shuttle, CreateShuttleInput } from "../types/graphql/Shuttle";
import { Context } from "../types/Context";
import { logger } from "../utils/logger";
import { Decimal } from "@prisma/client/runtime/library";
import { BookingStatus, ShuttleStatus } from "@prisma/client";

  // BookingStatus enum
  registerEnumType(BookingStatus, {
    name: "BookingStatus",
    description: "Status of a booking",
    valuesConfig: {
      CONFIRMED: { description: "Booking is confirmed" },
      CHECKED_IN: { description: "Passenger has checked in" },
      COMPLETED: { description: "Ride has been completed" },
    },
  });


// ShuttleStatus enum
  registerEnumType(ShuttleStatus, {
    name: "ShuttleStatus",
    description: "Current status of a shuttle",
    valuesConfig: {
      SCHEDULED: { description: "Shuttle is scheduled but not yet active" },
      BOARDING: { description: "Shuttle is boarding passengers" },
      IN_TRANSIT: { description: "Shuttle is currently in transit" },
    },
  });


// Types for the shuttle with bookings
type ShuttleWithBookings = {
  bookings: Array<{ numberOfSeats: number; status: BookingStatus }>;
  pickupLocation: any;
  dropoffLocation: any;
  currentLocation: any;
  capacity: number;
  [key: string]: any;
};

@Resolver(() => Shuttle)
export class ShuttleResolver {
  @Query(() => [Shuttle])
  async shuttles(
    @Arg("eventId", { nullable: true }) eventId?: string,
    @Arg("status", { nullable: true }) status?: string
  ): Promise<Shuttle[]> {
    const where: any = {};

    if (eventId) where.eventId = eventId;
    if (status) where.status = status;

    const shuttles = await prisma.shuttle.findMany({
      where: {
        ...where,
        status: status ? status as ShuttleStatus : undefined,
      },
      include: {
        event: true,
        bookings: {
          where: { 
            status: { 
              not: BookingStatus.CANCELLED 
            } 
          },
        },
      },
      orderBy: { departureTime: 'asc' },
    }) as unknown as ShuttleWithBookings[];

    return shuttles.map((shuttle: ShuttleWithBookings) => {
      const bookedSeats = shuttle.bookings.reduce(
        (sum: number, b: { numberOfSeats: number }) => sum + b.numberOfSeats,
        0
      );
      return {
        ...shuttle,
        availableSeats: shuttle.capacity - bookedSeats,
      } as unknown as Shuttle;
    });
  }

  @Query(() => Shuttle, { nullable: true })
  async shuttle(@Arg("id") id: string): Promise<Shuttle | null> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id },
      include: {
        event: true,
        bookings: {
          where: { 
            status: { 
              not: BookingStatus.CANCELLED 
            } 
          },
        },
      },
    }) as unknown as (ShuttleWithBookings | null);

    if (!shuttle) return null;

    const bookedSeats = shuttle.bookings.reduce(
      (sum: number, b: { numberOfSeats: number }) => sum + b.numberOfSeats,
      0
    );

    return {
      ...shuttle,
      availableSeats: shuttle.capacity - bookedSeats,
    } as unknown as Shuttle;
  }

  @Authorized("ADMIN", "OWNER")
  @Mutation(() => Shuttle)
  async createShuttle(
    @Arg("input") input: CreateShuttleInput,
    @Ctx() ctx: Context
  ): Promise<Shuttle> {
    // Convert basePrice to Decimal
    const basePrice = new Decimal(input.basePrice.toString());
    
    const shuttle = await prisma.shuttle.create({
      data: {
        eventId: input.eventId,
        vehicleNumber: input.vehicleNumber,
        capacity: input.capacity,
        departureTime: input.departureTime,
        arrivalTime: input.arrivalTime,
        pickupLocation: input.pickupLocation as any,
        dropoffLocation: input.dropoffLocation as any,
        basePrice,
        isFractionalized: input.isFractionalized,
        status: "SCHEDULED",
      },
      include: {
        event: true,
        bookings: true,
      },
    });

    logger.info(`Shuttle created: ${shuttle.vehicleNumber} (${shuttle.id})`);

    return {
      ...shuttle,
      pickupLocation: shuttle.pickupLocation as any,
      dropoffLocation: shuttle.dropoffLocation as any,
      currentLocation: shuttle.currentLocation as any,
      availableSeats: shuttle.capacity,
    } as any;
  }

  @Authorized("ADMIN", "OWNER", "DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleStatus(
    @Arg("shuttleId") shuttleId: string,
    @Arg("status") status: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.shuttle.update({
      where: { id: shuttleId },
      data: { status: status as any },
    });

    logger.info(`Shuttle ${shuttleId} status updated to ${status}`);
    return true;
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleLocation(
    @Arg("shuttleId") shuttleId: string,
    @Arg("latitude") latitude: number,
    @Arg("longitude") longitude: number,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.shuttle.update({
      where: { id: shuttleId },
      data: {
        currentLocation: {
          latitude,
          longitude,
        },
      },
    });

    return true;
  }

  @FieldResolver(() => Number)
  availableSeats(@Root() shuttle: any): number {
    return shuttle.availableSeats || 0;
  }
}
