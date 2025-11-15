import { Resolver, Query, Mutation, Arg, Ctx, Authorized,  } from "type-graphql";
import { prisma } from "../config/database";
import { Context } from "../types/Context";
import { ShuttleStatus } from "@prisma/client";
import { DriverStats, RideAssignment } from "../types/graphql/Driver";



@Resolver()
export class DriverResolver {
  @Authorized("DRIVER")
  @Query(() => DriverStats)
  async myDriverStats(@Ctx() ctx: Context): Promise<DriverStats> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { driverProfile: true },
    });

    if (!user?.driverProfile) {
      throw new Error("Driver profile not found");
    }

    const driver = user.driverProfile;

    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRides = await prisma.booking.findMany({
      where: {
        shuttle: { driverId: driver.id },
        paymentStatus: "COMPLETED",
        createdAt: { gte: today },
      },
    });

    const todayEarnings =
      todayRides.reduce((sum: number, b: { totalPrice: any }) => sum + Number(b.totalPrice), 0) * 0.1; // Driver gets 10% of ride cost

    // Calculate week's earnings
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekRides = await prisma.booking.findMany({
      where: {
        shuttle: { driverId: driver.id },
        paymentStatus: "COMPLETED",
        createdAt: { gte: weekAgo },
      },
    });

    const weekEarnings =
      weekRides.reduce((sum: number, b: { totalPrice: any }) => sum + Number(b.totalPrice), 0) * 0.1;

    return {
      totalRides: driver.totalRides,
      rating: Number(driver.rating),
      totalEarnings: Number(driver.earnings),
      todayEarnings,
      weekEarnings,
    };
  }

  @Authorized("DRIVER")
  @Query(() => [RideAssignment])
  async myAssignedRides(@Ctx() ctx: Context): Promise<RideAssignment[]> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { driverProfile: true },
    });

    if (!user?.driverProfile) {
      throw new Error("Driver profile not found");
    }

    const shuttles = await prisma.shuttle.findMany({
      where: {
        driverId: user.driverProfile.id,
        status: { in: ["SCHEDULED", "BOARDING", "IN_TRANSIT"] },
      },
      include: {
        bookings: true,
      },
      orderBy: { departureTime: "asc" },
    });

    return shuttles.map((shuttle: any) => ({
      id: shuttle.id,
      shuttleId: shuttle.id,
      vehicleNumber: shuttle.vehicleNumber,
      departureTime: shuttle.departureTime,
      pickupLocation: shuttle.pickupLocation as any,
      dropoffLocation: shuttle.dropoffLocation as any,
      status: shuttle.status,
      bookedSeats: shuttle.bookings.length,
      capacity: shuttle.capacity,
    }));
  }

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateDriverStatus(
    @Arg("isOnline") isOnline: boolean,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { driverProfile: true },
    });

    if (!user?.driverProfile) {
      throw new Error("Driver profile not found");
    }

    await prisma.driver.update({
      where: { id: user.driverProfile.id },
      data: { isOnline },
    });

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
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { driverProfile: true },
    });

    if (!user?.driverProfile) {
      throw new Error("Driver profile not found");
    }

    // Verify driver owns this shuttle
    const shuttle = await prisma.shuttle.findFirst({
      where: {
        id: shuttleId,
        driverId: user.driverProfile.id,
      },
    });

    if (!shuttle) {
      throw new Error("Unauthorized");
    }

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

  @Authorized("DRIVER")
  @Mutation(() => Boolean)
  async updateShuttleStatus(
    @Arg("shuttleId") shuttleId: string,
    @Arg("status", () => String) status: ShuttleStatus,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { driverProfile: true },
    });

    if (!user?.driverProfile) {
      throw new Error("Driver profile not found");
    }

    await prisma.shuttle.update({
      where: { id: shuttleId },
      data: { status },
    });

    return true;
  }
}
