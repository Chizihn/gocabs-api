// src/resolvers/DriverResolver.ts
import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  ObjectType,
  Field,
  Int,
  Float,
} from "type-graphql";
import { prisma } from "../config/database";
import { ShuttleStatus, } from "@prisma/client";
import { Context } from "../types/Context";
import { Location } from "../types/graphql/Location";

// ====================== DRIVER STATS RESPONSE ======================
@ObjectType()
class PassengerInfo {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;
}

@ObjectType()
class RouteInfo {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Location)
  startLocation!: Location;

  @Field(() => Location)
  endLocation!: Location;

  @Field(() => [Location])
  waypoints!: Location[];
}

@ObjectType()
class RideAssignment {
  @Field(() => String)
  shuttleId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => Location)
  pickupLocation!: Location;

  @Field(() => Location)
  dropoffLocation!: Location;

  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  @Field(() => Int)
  bookedSeats!: number;

  @Field(() => [PassengerInfo])
  passengers!: PassengerInfo[];

  @Field(() => RouteInfo)
  route!: RouteInfo;
}

@ObjectType()
class DriverStats {
  @Field(() => Int)
  totalRides!: number;

  @Field(() => Float)
  rating!: number;

  @Field(() => Float)
  totalEarnings!: number;

  @Field(() => Float)
  todayEarnings!: number;

  @Field(() => Float)
  weekEarnings!: number;

  @Field(() => RideAssignment, { nullable: true })
  currentAssignment?: RideAssignment | null;
}

@Resolver()
export class DriverResolver {
  // Helper: Get authenticated driver
  private async getDriver(ctx: Context) {
    if (!ctx.userId) throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      include: { driver: true },
    });

    if (!user?.driver) {
      throw new Error("Driver profile not found");
    }

    return user.driver;
  }

  // ====================== MY STATS ======================
  @Authorized("DRIVER")
  @Query(() => DriverStats)
  async myDriverStats(@Ctx() ctx: Context): Promise<DriverStats> {
    const driver = await this.getDriver(ctx);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayBookings, weekBookings, activeShuttle] = await Promise.all([
      prisma.booking.findMany({
        where: {
          shuttle: { driverId: driver.id },
          paymentStatus: "COMPLETED",
          createdAt: { gte: today },
        },
        select: { totalPriceUsdc: true },
      }),
      prisma.booking.findMany({
        where: {
          shuttle: { driverId: driver.id },
          paymentStatus: "COMPLETED",
          createdAt: { gte: weekAgo },
        },
        select: { totalPriceUsdc: true },
      }),
      prisma.shuttle.findFirst({
        where: {
          driverId: driver.id,
          status: { in: [ShuttleStatus.BOARDING, ShuttleStatus.IN_TRANSIT] },
        },
        include: {
          event: true,
          vehicle: true,
          bookings: {
            where: { status: { in: ["CONFIRMED", "PICKED_UP"] } },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  phoneNumber: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const driverCommission = 0.10; // 10%

    const todayEarnings = todayBookings.reduce(
      (sum, b) => sum + Number(b.totalPriceUsdc) * driverCommission,
      0
    );

    const weekEarnings = weekBookings.reduce(
      (sum, b) => sum + Number(b.totalPriceUsdc) * driverCommission,
      0
    );

    const currentAssignment: RideAssignment | null = activeShuttle
      ? {
          shuttleId: activeShuttle.id,
          eventId: activeShuttle.eventId,
          status: activeShuttle.status,
          departureTime: activeShuttle.departureTime,
          arrivalTime: activeShuttle.arrivalTime,
          pickupLocation: activeShuttle.pickupLocation as any,
          dropoffLocation: activeShuttle.dropoffLocation as any,
          currentLat: activeShuttle.currentLat,
          currentLng: activeShuttle.currentLng,
          bookedSeats: activeShuttle.bookings.reduce((s, b) => s + b.seats, 0),
          passengers: activeShuttle.bookings.map((b) => ({
            id: b.user.id,
            name: b.user.username || "Passenger",
            email: b.user.email,
            phone: b.user.phoneNumber,
          })),
          route: {
            id: activeShuttle.event.id,
            name: activeShuttle.event.name,
            startLocation: activeShuttle.pickupLocation as any,
            endLocation: activeShuttle.dropoffLocation as any,
            waypoints: [],
          },
        }
      : null;

    return {
      totalRides: driver.totalRides,
      rating: Number(driver.rating),
      totalEarnings: Number(driver.earnings),
      todayEarnings: Number(todayEarnings.toFixed(2)),
      weekEarnings: Number(weekEarnings.toFixed(2)),
      currentAssignment,
    };
  }

  // ====================== MY ASSIGNED RIDES ======================
  @Authorized("DRIVER")
  @Query(() => [RideAssignment])
  async myAssignedRides(@Ctx() ctx: Context): Promise<RideAssignment[]> {
    const driver = await this.getDriver(ctx);

    const shuttles =  await prisma.shuttle.findMany({
      where: {
        driverId: driver.id,
        status: { in: [ShuttleStatus.SCHEDULED, ShuttleStatus.BOARDING, ShuttleStatus.IN_TRANSIT] },
        departureTime: { gte: new Date() },
      },
      include: {
        event: true,
        bookings: {
          where: { status: "CONFIRMED" },
          include: {
            user: {
              select: { id: true, username: true, phoneNumber: true, email: true },
            },
          },
        },
      },
      orderBy: { departureTime: "asc" },
    });

    return shuttles.map((s) => ({
      shuttleId: s.id,
      eventId: s.eventId,
      status: s.status,
      departureTime: s.departureTime,
      arrivalTime: s.arrivalTime,
      pickupLocation: s.pickupLocation as any,
      dropoffLocation: s.dropoffLocation as any,
      currentLat: s.currentLat,
      currentLng: s.currentLng,
      bookedSeats: s.bookings.reduce((sum, b) => sum + b.seats, 0),
      passengers: s.bookings.map((b) => ({
        id: b.user.id,
        name: b.user.username || "Passenger",
        email: b.user.email,
        phone: b.user.phoneNumber,
      })),
      route: {
        id: s.event.id,
        name: s.event.name,
        startLocation: s.pickupLocation as any,
        endLocation: s.dropoffLocation as any,
        waypoints: [],
      },
    }));
  }

  // ====================== GO ONLINE / OFFLINE ======================
  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async setDriverOnline(
    @Ctx() ctx: Context,
    @Arg("isOnline", () => Boolean) isOnline: boolean
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);
    await prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline },
    });
    return true;
  }

  // ====================== UPDATE SHUTTLE STATUS ======================
  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateAssignedShuttleStatus(
    @Ctx() ctx: Context,
    @Arg("shuttleId") shuttleId: string,
    @Arg("status", () => ShuttleStatus) status: ShuttleStatus
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);

    const updated = await prisma.shuttle.updateMany({
      where: {
        id: shuttleId,
        driverId: driver.id,
      },
      data: { status },
    });

    if (updated.count === 0) {
      throw new Error("Shuttle not found or not assigned to you");
    }

    return true;
  }

  // ====================== UPDATE LIVE LOCATION ======================
  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateAssignedShuttleLocation(
    @Ctx() ctx: Context,
    @Arg("shuttleId") shuttleId: string,
    @Arg("latitude", () => Float) latitude: number,
    @Arg("longitude", () => Float) longitude: number
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);

    const shuttle = await prisma.shuttle.findFirst({
      where: { id: shuttleId, driverId: driver.id },
      select: { id: true },
    });

    if (!shuttle) {
      throw new Error("You are not assigned to this shuttle");
    }

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
}