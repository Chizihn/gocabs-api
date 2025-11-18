import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import type { Context } from "../types/Context";
import { prisma } from "../config/database";
import { FleetOverview, VehicleDetails } from "../types/graphql/Fleet";
import { Driver } from "../types/graphql/Driver";
import { Owner } from "../types/graphql/Owner";
import { Shuttle, ShuttleStatus } from "@prisma/client";
import { CreateShuttleInput } from "../types/graphql/Shuttle";

@Resolver(() => Owner)
export class OwnerResolver {
  @Authorized("OWNER")
  @Query(() => FleetOverview)
  async myFleetOverview(@Ctx() ctx: Context): Promise<FleetOverview> {
    const owner = await prisma.owner.findUnique({
      where: { userId: ctx.userId! },
    });

    if (!owner) {
      throw new Error("Owner not found");
    }

    const shuttles = await prisma.shuttle.findMany({
      include: {
        bookings: {
          where: {
            paymentStatus: 'COMPLETED'
          }
        }
      }
    });

    const totalVehicles = shuttles.length;
    const activeVehicles = shuttles.filter(s => s.status === 'IN_TRANSIT' || s.status === 'BOARDING').length;

    const totalRevenue = shuttles.flatMap(s => s.bookings).reduce((sum, booking) => sum + Number(booking.totalPriceUsdc), 0);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const monthRevenue = shuttles.flatMap(s => s.bookings)
      .filter(b => b.createdAt >= oneMonthAgo)
      .reduce((sum, booking) => sum + Number(booking.totalPriceUsdc), 0);

    return {
      totalVehicles,
      activeVehicles,
      totalRevenue,
      monthRevenue,
    };
  }

  @Authorized("OWNER")
  @Query(() => [VehicleDetails])
  async myVehicles(@Ctx() ctx: Context): Promise<VehicleDetails[]> {
    const shuttles = await prisma.shuttle.findMany();
    return shuttles.map(shuttle => ({
      ...shuttle,
      basePriceUsdc: shuttle.basePriceUsdc.toNumber(),
      pickupLocation: JSON.parse(shuttle.pickupLocation as string),
      dropoffLocation: JSON.parse(shuttle.dropoffLocation as string),
      driverId: shuttle.driverId,
    }));
  }

  @Authorized("OWNER")
  @Query(() => VehicleDetails, { nullable: true })
  async vehicle(@Arg("id") id: string): Promise<VehicleDetails | null> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id },
    });

    if (!shuttle) {
      return null;
    }

    return {
      ...shuttle,
      basePriceUsdc: shuttle.basePriceUsdc.toNumber(),
      pickupLocation: JSON.parse(shuttle.pickupLocation as string),
      dropoffLocation: JSON.parse(shuttle.dropoffLocation as string),
      driverId: shuttle.driverId,
    };
  }

  @Authorized("OWNER")
  @Query(() => [Driver])
  async myDrivers(): Promise<Driver[]> {
    const drivers = await prisma.driver.findMany({
      include: {
        user: true,
      },
    });
    return drivers.map(driver => ({
      ...driver,
      user: {
        ...driver.user,
        notificationSettings: JSON.parse(driver.user.notificationSettings as string),
        locationSettings: JSON.parse(driver.user.locationSettings as string),
      }
    }));
  }

  @Authorized("OWNER")
  @Query(() => Driver, { nullable: true })
  async driverDetails(@Arg("driverId") driverId: string): Promise<Driver | null> {
    const driver = await prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      include: {
        user: true,
      },
    });

    if (!driver) {
      return null;
    }

    return {
      ...driver,
      user: {
        ...driver.user,
        notificationSettings: JSON.parse(driver.user.notificationSettings as string),
        locationSettings: JSON.parse(driver.user.locationSettings as string),
      }
    };
  }

  @Authorized("OWNER")
  @Mutation(() => VehicleDetails)
  async addVehicle(
    @Arg("data") data: CreateShuttleInput,
    @Ctx() ctx: Context
  ): Promise<VehicleDetails> {
    const owner = await prisma.owner.findUnique({
      where: { userId: ctx.userId! },
    });

    if (!owner) {
      throw new Error("Owner not found");
    }

    const shuttle = await prisma.shuttle.create({
      data: {
        ...data,
        availableSeats: data.capacity,
        pickupLocation: data.pickupLocation as any,
        dropoffLocation: data.dropoffLocation as any,
      },
    });

    return {
      ...shuttle,
      basePriceUsdc: shuttle.basePriceUsdc.toNumber(),
      pickupLocation: shuttle.pickupLocation as any,
      dropoffLocation: shuttle.dropoffLocation as any,
      driverId: shuttle.driverId,
    };
  }

  @Authorized("OWNER")
  @Mutation(() => Boolean)
  async assignDriverToVehicle(
    @Arg("driverId") driverId: string,
    @Arg("shuttleId") shuttleId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    const owner = await prisma.owner.findUnique({
      where: { userId: ctx.userId! },
    });

    if (!owner) {
      throw new Error("Owner not found");
    }

    await prisma.shuttle.update({
      where: {
        id: shuttleId,
      },
      data: {
        driverId,
      },
    });

    return true;
  }
}