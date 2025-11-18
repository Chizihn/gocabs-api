import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { prisma } from "../config/database";
import { Prisma, ShuttleStatus } from "@prisma/client";
import { DriverStats, RideAssignment } from "../types/graphql/Driver";
import { Decimal } from "@prisma/client/runtime/library";
import { type Context } from "../types/Context";

@Resolver()
export class DriverResolver {
  private async getDriver(ctx: Context) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: {
        driver: {
          include: {
            currentShuttle: {
              include: {
                event: true,
                bookings: {
                  where: { status: "CONFIRMED" },
                  include: {
                    user: {
                      select: {
                        id: true,
                        username: true,
                        email: true,
                        phoneNumber: true,
                        fcmToken: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user?.driver) {
      throw new Error("Driver profile not found");
    }

    return user.driver;
  }

  @Authorized("DRIVER")
  @Query(() => DriverStats)
  async myDriverStats(@Ctx() ctx: Context): Promise<DriverStats> {
    const driver = await this.getDriver(ctx);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayRides, weekRides, currentShuttle] = await Promise.all([
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
          bookings: {
            where: { status: "CONFIRMED" },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  phoneNumber: true,
                  fcmToken: true,
                },
              },
            },
          },
          event: true,
        },
      }),
    ]);

    // Calculate earnings using Decimal for precision
    const todayEarnings = todayRides.reduce(
      (sum, booking) => sum.plus(booking.totalPriceUsdc.times(0.1)), // 10% commission
      new Decimal(0)
    );

    const weekEarnings = weekRides.reduce(
      (sum, booking) => sum.plus(booking.totalPriceUsdc.times(0.1)),
      new Decimal(0)
    );

    return {
      totalRides: driver.totalRides,
      rating: driver.rating.toNumber(),
      totalEarnings: driver.earnings.toNumber(),
      todayEarnings: todayEarnings.toNumber(),
      weekEarnings: weekEarnings.toNumber(),
      currentAssignment: currentShuttle
        ? {
            shuttleId: currentShuttle.id,
            eventId: currentShuttle.eventId,
            licensePlate: currentShuttle.licensePlate,
            vehicleType: currentShuttle.vehicleType,
            status: currentShuttle.status,
            departureTime: currentShuttle.departureTime,
            arrivalTime: currentShuttle.arrivalTime,
            pickupLocation: currentShuttle.pickupLocation as any,
            dropoffLocation: currentShuttle.dropoffLocation as any,
            currentLat: currentShuttle.currentLat,
            currentLng: currentShuttle.currentLng,
            passengers: currentShuttle.bookings.map((booking) => ({
              id: booking.user.id,
              name: booking.user.username ?? "Passenger",
              email: booking.user.email ?? "",
              phone: booking.user.phoneNumber ?? "",
            })),
            route: {
              id: currentShuttle.event?.id || "unknown-route",
              name: currentShuttle.event?.name || "Unnamed Route",
              startLocation: currentShuttle.pickupLocation as any,
              endLocation: currentShuttle.dropoffLocation as any,
              waypoints: [],
            },
            capacity: currentShuttle.capacity,
            bookedSeats: currentShuttle.bookings.reduce(
              (sum, b) => sum + b.seats,
              0
            ),
          }
        : null,
    };
  }

  @Authorized("DRIVER")
  @Query(() => [RideAssignment])
  async myAssignedRides(@Ctx() ctx: Context): Promise<RideAssignment[]> {
    const driver = await this.getDriver(ctx);

    const shuttles = await prisma.shuttle.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: [
            ShuttleStatus.SCHEDULED,
            ShuttleStatus.BOARDING,
            ShuttleStatus.IN_TRANSIT,
          ],
        },
        departureTime: { gte: new Date() },
      },
      include: {
        event: true,
        bookings: {
          where: { status: "CONFIRMED" },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                phoneNumber: true,
                fcmToken: true,
              },
            },
          },
        },
      },
      orderBy: { departureTime: "asc" },
    });

    return shuttles.map((shuttle) => ({
      shuttleId: shuttle.id,
      eventId: shuttle.eventId,
      licensePlate: shuttle.licensePlate,
      vehicleType: shuttle.vehicleType,
      status: shuttle.status,
      departureTime: shuttle.departureTime,
      arrivalTime: shuttle.arrivalTime,
      pickupLocation: shuttle.pickupLocation as any,
      dropoffLocation: shuttle.dropoffLocation as any,
      currentLat: shuttle.currentLat,
      currentLng: shuttle.currentLng,
      capacity: shuttle.capacity,
      bookedSeats: shuttle.bookings.reduce(
        (sum, booking) => sum + booking.seats,
        0
      ),
      passengers: shuttle.bookings.map((booking) => ({
        id: booking.user.id,
        name: booking.user.username || "Passenger",
        email: booking.user.email || "",
        phone: booking.user.phoneNumber || "",
      })),
      route: {
        id: shuttle.event?.id || "unknown-route",
        name: shuttle.event?.name || "Unnamed Route",
        startLocation: shuttle.pickupLocation as any,
        endLocation: shuttle.dropoffLocation as any,
        waypoints: [],
      },
    }));
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async setDriverOnline(
    @Ctx() ctx: Context,
    @Arg("isOnline") isOnline: boolean
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);
    await prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline },
    });
    return true;
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateAssignedShuttleStatus(
    @Ctx() ctx: Context,
    @Arg("shuttleId") shuttleId: string,
    @Arg("status", () => ShuttleStatus) status: ShuttleStatus
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);

    await prisma.shuttle.updateMany({
      where: { id: shuttleId, driverId: driver.id },
      data: { status },
    });

    return true;
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateAssignedShuttleLocation(
    @Ctx() ctx: Context,
    @Arg("shuttleId") shuttleId: string,
    @Arg("latitude", () => Number) latitude: number,
    @Arg("longitude", () => Number) longitude: number
  ): Promise<boolean> {
    const driver = await this.getDriver(ctx);
    const now = new Date();

    try {
      // Verify the driver is assigned to this shuttle
      const shuttle = await prisma.shuttle.findFirst({
        where: {
          id: shuttleId,
          driverId: driver.id,
        },
        select: { id: true },
      });

      if (!shuttle) {
        throw new Error("Shuttle not found or not assigned to this driver");
      }

      // Update shuttle location
      await prisma.shuttle.update({
        where: { id: shuttleId },
        data: {
          currentLat: latitude,
          currentLng: longitude,
          lastLocationUpdate: now,
        },
      });

      // Update driver's current location
      await prisma.driver.update({
        where: { id: driver.id },
        data: {
          currentLat: latitude,
          currentLng: longitude,
        },
      });

      return true;
    } catch (error) {
      console.error("Error updating shuttle location:", error);
      throw new Error("Failed to update shuttle location");
    }
  }
}
