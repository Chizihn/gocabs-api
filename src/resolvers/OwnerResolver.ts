import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  Int,
} from "type-graphql";
import { Context } from "../types/Context";
import { prisma } from "../config/database";
import {
  Vehicle,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleResponse,
  VehiclesResponse,
} from "../types/graphql/Vehicle";
import {
  Shuttle,
  CreateShuttleInput,
  UpdateShuttleInput,
} from "../types/graphql/Shuttle";
import { Driver } from "../types/graphql/Driver";
import { Owner } from "../types/graphql/Owner";
import { FleetOverview } from "../types/graphql/Fleet";



@Resolver(() => Owner)
export class OwnerResolver {
  // ====================== 1. FLEET OVERVIEW ======================
  @Authorized("OWNER")
  @Query(() => FleetOverview)
  async myFleetOverview(@Ctx() { userId }: Context): Promise<FleetOverview> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
      include: {
        vehicles: {
          include: {
            shuttles: {
              include: {
                bookings: {
                  where: { paymentStatus: "COMPLETED" },
                },
                driver: true,
              },
            },
          },
        },
      },
    });

    if (!owner) throw new Error("Owner profile not found");

    const allShuttles = owner.vehicles.flatMap((v) => v.shuttles);

    const totalVehicles = owner.vehicles.length;
    const activeVehicles = allShuttles.filter(
      (s) => s.status === "IN_TRANSIT" || s.status === "BOARDING"
    ).length;

    const totalRevenue = allShuttles
      .flatMap((s) => s.bookings)
      .reduce((sum, b) => sum + Number(b.totalPriceUsdc), 0);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const monthRevenue = allShuttles
      .flatMap((s) => s.bookings)
      .filter((b) => b.createdAt >= oneMonthAgo)
      .reduce((sum, b) => sum + Number(b.totalPriceUsdc), 0);

    const uniqueDrivers = new Set(
      allShuttles.map((s) => s.driverId).filter(Boolean)
    );
    const totalDrivers = uniqueDrivers.size;

    const activeDrivers = allShuttles
      .filter(
        (s) =>
          s.driver?.isOnline &&
          (s.status === "IN_TRANSIT" || s.status === "BOARDING")
      )
      .map((s) => s.driverId)
      .filter(Boolean).length;

    return {
      totalVehicles,
      activeVehicles,
      totalRevenue,
      monthRevenue,
      totalDrivers,
      activeDrivers,
    };
  }

  // ====================== 2. MY VEHICLES ======================
  @Authorized("OWNER")
  @Query(() => VehiclesResponse)
  async myVehicles(@Ctx() { userId }: Context): Promise<VehiclesResponse> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
      include: {
        vehicles: {
          include: {
            shuttles: {
              include: { driver: true, event: true },
            },
          },
        },
      },
    });

    if (!owner) {
      return { success: false, message: "Owner not found" };
    }

    return {
      success: true,
      vehicles: owner.vehicles as unknown as Vehicle[],
      total: owner.vehicles.length,
    };
  }

  // ====================== 2b. SINGLE VEHICLE DETAILS ======================
  @Authorized("OWNER")
  @Query(() => VehicleResponse)
  async myVehicle(
    @Arg("vehicleId") vehicleId: string,
    @Ctx() { userId }: Context
  ): Promise<VehicleResponse> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
    });

    if (!owner) {
      return { success: false, message: "Owner not found" };
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: owner.id },
      include: {
        owner: true,
        shuttles: {
          include: {
            driver: true,
            event: true,
          },
        },
      },
    });

    if (!vehicle) {
      return {
        success: false,
        message: "Vehicle not found or not owned by you",
      };
    }

    return {
        success: true,
        vehicle: {
          id: vehicle.id,
          ownerId: vehicle.ownerId,
          vehicleNumber: vehicle.vehicleNumber,
          licensePlate: vehicle.licensePlate,
          vehicleType: vehicle.vehicleType || 'minibus',
          capacity: vehicle.capacity,
          mileage: vehicle.mileage,          
          lastMaintenance: vehicle.lastMaintenance,
          nextMaintenance: vehicle.nextMaintenance,
          owner: vehicle.owner,
          shuttles: (vehicle.shuttles || []) as any,
          createdAt: vehicle.createdAt,
          updatedAt: vehicle.updatedAt,
        },
      };
  }

  // ====================== 3. CREATE VEHICLE ======================
  @Authorized("OWNER")
  @Mutation(() => VehicleResponse)
  async createVehicle(
    @Arg("data") data: CreateVehicleInput,
    @Ctx() { userId }: Context
  ): Promise<VehicleResponse> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
    });

    if (!owner) {
      return { success: false, message: "Owner not found" };
    }

    try {
      const vehicle = await prisma.vehicle.create({
        data: {
          ...data,
          ownerId: owner.id,
        },
        include: { owner: true },
      });

      return { success: true, vehicle };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Failed to create vehicle",
      };
    }
  }

  // ====================== 4. UPDATE VEHICLE ======================
  @Authorized("OWNER")
  @Mutation(() => VehicleResponse)
  async updateVehicle(
    @Arg("vehicleId") vehicleId: string,
    @Arg("data") data: UpdateVehicleInput,
    @Ctx() { userId }: Context
  ): Promise<VehicleResponse> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
    });

    if (!owner) {
      return { success: false, message: "Owner not found" };
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: owner.id },
    });

    if (!vehicle) {
      return { success: false, message: "Vehicle not found or not owned by you" };
    }

    try {
      const updated = await prisma.vehicle.update({
        where: { id: vehicleId },
        data,
        include: { owner: true },
      });

      return { success: true, vehicle: updated };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ====================== 5. CREATE SHUTTLE ======================
  @Authorized("OWNER")
  @Mutation(() => Shuttle)
  async createShuttle(
    @Arg("data") data: CreateShuttleInput,
    @Ctx() { userId }: Context
  ): Promise<Shuttle> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
    });

    if (!owner) throw new Error("Owner not found");

    // Verify vehicle belongs to this owner
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, ownerId: owner.id },
    });

    if (!vehicle) throw new Error("Vehicle not found or not owned by you");

    const shuttle = await prisma.shuttle.create({
      data: {
        eventId: data.eventId,
        vehicleId: data.vehicleId,
        driverId: data.driverId || null,
        departureTime: data.departureTime,
        arrivalTime: data.arrivalTime,
        pickupLocation: data.pickupLocation as any,
        dropoffLocation: data.dropoffLocation as any,
        basePriceUsdc: data.basePriceUsdc,
        isFractionalized: data.isFractionalized || false,
      },
      include: {
        event: true,
        vehicle: true,
        driver: true,
      },
    });

    return shuttle as unknown as Shuttle;
  }

  // ====================== 6. ASSIGN DRIVER TO SHUTTLE ======================
  @Authorized("OWNER")
  @Mutation(() => Boolean)
  async assignDriverToShuttle(
    @Arg("shuttleId") shuttleId: string,
    @Arg("driverId") driverId: string,
    @Ctx() { userId }: Context
  ): Promise<boolean> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
    });

    if (!owner) throw new Error("Owner not found");

    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: { vehicle: { select: { ownerId: true } } },
    });

    if (!shuttle || shuttle.vehicle.ownerId !== owner.id) {
      throw new Error("Shuttle not found or not owned by you");
    }

    await prisma.shuttle.update({
      where: { id: shuttleId },
      data: { driverId },
    });

    return true;
  }

  // ====================== 7. MY DRIVERS (EVER DRIVEN FOR ME) ======================
  @Authorized("OWNER")
  @Query(() => [Driver])
  async myDrivers(@Ctx() { userId }: Context): Promise<Driver[]> {
    const owner = await prisma.owner.findUnique({
      where: { userId: userId! },
      include: {
        vehicles: {
          include: {
            shuttles: {
              where: { driverId: { not: null } },
              select: { driverId: true },
              distinct: ["driverId"],
            },
          },
        },
      },
    });

    if (!owner) throw new Error("Owner not found");

    const driverIds = owner.vehicles
      .flatMap((v) => v.shuttles)
      .map((s) => s.driverId!)
      .filter(Boolean);

    if (driverIds.length === 0) return [];

    const drivers = await prisma.driver.findMany({
      where: { id: { in: driverIds } },
      include: { user: true },
    });

    return drivers as unknown as Driver[];
  }

  
  // ====================== 8. AVAILABLE DRIVERS ======================
  @Authorized("OWNER")
  @Query(() => [Driver])
  async availableDrivers(
    @Arg("limit", () => Int, { defaultValue: 20 }) limit: number,
    @Arg("offset", () => Int, { defaultValue: 0 }) offset: number
  ): Promise<Driver[]> {
    const drivers = await prisma.driver.findMany({
      where: {
        isOnline: true,
        currentShuttle: null,
      },
      include: { user: true },
      orderBy: { rating: "desc" },
      take: limit,
      skip: offset,
    });

    return drivers as unknown as Driver[];
  }
}