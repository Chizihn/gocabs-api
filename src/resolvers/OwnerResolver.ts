import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,

} from "type-graphql";
import type { Context } from "../types/Context";
import { prisma } from "../config/database";
import { FleetOverview, VehicleDetails } from "../types/graphql/Fleet";
import { DriverDetails } from "../types/graphql/Driver";



@Resolver()
export class OwnerResolver {
  @Authorized("OWNER")
  @Query(() => FleetOverview)
  async myFleetOverview(@Ctx() ctx: Context): Promise<FleetOverview> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    const ownerId = user.ownerProfile.id;

    // Count vehicles
    const totalVehicles = await prisma.vehicle.count({
      where: { ownerId },
    });

    const activeVehicles = await prisma.vehicle.count({
      where: { ownerId, isActive: true },
    });

    // Count drivers
    const totalDrivers = await prisma.driver.count({
      where: { ownerId },
    });

    const activeDrivers = await prisma.driver.count({
      where: { ownerId, isOnline: true },
    });

    // Calculate revenue
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const monthBookings = await prisma.booking.findMany({
      where: {
        shuttle: {
          driver: { ownerId },
        },
        paymentStatus: "COMPLETED",
        createdAt: { gte: monthAgo },
      },
    });

    const monthRevenue = monthBookings.reduce(
      (sum: number, b: { totalPrice: any }) => sum + Number(b.totalPrice),
      0
    );

    return {
      totalVehicles,
      activeVehicles,
      totalDrivers,
      activeDrivers,
      totalRevenue: Number(user.ownerProfile.totalRevenue),
      monthRevenue,
    };
  }

  @Authorized("OWNER")
  @Query(() => [VehicleDetails])
  async myVehicles(@Ctx() ctx: Context): Promise<VehicleDetails[]> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: user.ownerProfile.id },
      orderBy: { createdAt: "desc" },
    });

    // Map the vehicles to match the VehicleDetails type
    return vehicles.map(vehicle => ({
      id: vehicle.id,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity,
      licensePlate: vehicle.licensePlate,
      isActive: vehicle.isActive,
      lastMaintenance: vehicle.lastMaintenance,
      nextMaintenance: vehicle.nextMaintenance,
      mileage: vehicle.mileage,
    }));
  }

  @Authorized("OWNER")
  @Query(() => [DriverDetails])
  async myDrivers(@Ctx() ctx: Context): Promise<DriverDetails[]> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    const drivers = await prisma.driver.findMany({
      where: { ownerId: user.ownerProfile.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    return drivers.map((driver: any) => ({
      id: driver.id,
      email: driver.user.email!,
      phoneNumber: driver.user.phoneNumber!,
      licenseNumber: driver.licenseNumber,
      rating: Number(driver.rating),
      totalRides: driver.totalRides,
      isOnline: driver.isOnline,
      isVerified: driver.isVerified,
      earnings: Number(driver.earnings),
    }));
  }

  @Authorized("OWNER")
  @Mutation(() => VehicleDetails)
  async addVehicle(
    @Arg("vehicleNumber") vehicleNumber: string,
    @Arg("vehicleType") vehicleType: string,
    @Arg("capacity") capacity: number,
    @Arg("licensePlate") licensePlate: string,
    @Ctx() ctx: Context
  ): Promise<VehicleDetails> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: user.ownerProfile.id,
        vehicleNumber,
        vehicleType,
        capacity,
        licensePlate,
        isActive: true,
        // Initialize with default values
        mileage: 0,
      },
    });

    // Map the created vehicle to match the VehicleDetails type
    return {
      id: vehicle.id,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity,
      licensePlate: vehicle.licensePlate,
      isActive: vehicle.isActive,
      lastMaintenance: vehicle.lastMaintenance,
      nextMaintenance: vehicle.nextMaintenance,
      mileage: vehicle.mileage,
    };
  }

  @Authorized("OWNER")
  @Query(() => DriverDetails, { nullable: true })
  async driverDetails(
    @Arg("driverId") driverId: string,
    @Ctx() ctx: Context
  ): Promise<DriverDetails | null> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    const driver = await prisma.driver.findFirst({
      where: {
        id: driverId,
        ownerId: user.ownerProfile.id,
      },
      include: { user: true },
    });

    if (!driver) {
      return null;
    }

    return {
      id: driver.id,
      email: driver.user.email!,
      phoneNumber: driver.user.phoneNumber!,
      licenseNumber: driver.licenseNumber,
      rating: Number(driver.rating),
      totalRides: driver.totalRides,
      isOnline: driver.isOnline,
      isVerified: driver.isVerified,
      earnings: Number(driver.earnings),
    };
  }

  @Authorized("OWNER")
  @Mutation(() => Boolean)
  async assignDriverToVehicle(
    @Arg("driverId") driverId: string,
    @Arg("vehicleId") vehicleId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      include: { ownerProfile: true },
    });

    if (!user?.ownerProfile) {
      throw new Error("Owner profile not found");
    }

    // Verify the driver exists and belongs to this owner
    const driver = await prisma.driver.findFirst({
      where: {
        id: driverId,
        ownerId: user.ownerProfile.id,
      },
    });

    if (!driver) {
      throw new Error("Driver not found or does not belong to you");
    }

    // Verify the vehicle exists and belongs to this owner
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ownerId: user.ownerProfile.id,
      },
    });

    if (!vehicle) {
      throw new Error("Vehicle not found or does not belong to you");
    }

    // Check if the driver is already assigned to a different vehicle
    if (driver.currentShuttleId) {
      // Check if the driver is assigned to a different shuttle
      const currentShuttle = await prisma.shuttle.findUnique({
        where: { id: driver.currentShuttleId },
      });
      
      if (currentShuttle && currentShuttle.vehicleNumber !== vehicle.vehicleNumber) {
        throw new Error("Driver is already assigned to a different vehicle");
      }
    }

    // Check if the vehicle is already assigned to a different driver in an active shuttle
    const existingShuttle = await prisma.shuttle.findFirst({
      where: {
        vehicleNumber: vehicle.vehicleNumber,
        status: {
          in: ["SCHEDULED", "BOARDING", "IN_TRANSIT"],
        },
        driverId: {
          not: driverId,
        },
      },
    });

    if (existingShuttle) {
      throw new Error("Vehicle is already assigned to a different driver in an active shuttle");
    }

    // If the driver is already assigned to a shuttle with this vehicle, no need to update
    if (driver.currentShuttleId) {
      const currentShuttle = await prisma.shuttle.findUnique({
        where: { id: driver.currentShuttleId },
      });
      
      if (currentShuttle?.vehicleNumber === vehicle.vehicleNumber) {
        return true; // Already assigned to this vehicle
      }
    }

    // Create a new shuttle for this vehicle assignment
    const shuttle = await prisma.shuttle.create({
      data: {
        eventId: "temporary-event-id", // This should be replaced with an actual event ID
        vehicleNumber: vehicle.vehicleNumber,
        capacity: vehicle.capacity,
        departureTime: new Date(), // Set appropriate departure time
        arrivalTime: new Date(Date.now() + 3600000), // Set appropriate arrival time (1 hour later)
        pickupLocation: {}, // Set appropriate pickup location
        dropoffLocation: {}, // Set appropriate dropoff location
        basePrice: 0, // Set appropriate base price
        status: "SCHEDULED",
        driverId: driverId,
      },
    });

    // Update the driver's current shuttle
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentShuttleId: shuttle.id,
      },
    });

    return true;
  }
}
