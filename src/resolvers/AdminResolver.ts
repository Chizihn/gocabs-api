import 'reflect-metadata'; // Ensure this is at the top if needed by TypeGraphQL
import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  Int,
} from "type-graphql";
import { prisma } from "../config/database";
import type { Context } from "../types/Context";
import { logger } from "../utils/logger";
import { UserRole, ShuttleStatus, BookingStatus, PaymentStatus, Prisma, User, Event as PrismaEvent, Shuttle as PrismaShuttle } from "@prisma/client";
import { 
  AdminCreateShuttleInput, 
  DashboardStats, 
  UserWithProfiles,
  EventResponse,
  ShuttleResponse,
  EventFilterInput,
  ShuttleFilterInput
} from "../types/graphql/Admin"; // Assuming EventFilterInput and ShuttleFilterInput will be added
import { Booking } from "../types/graphql/Booking";
import { 
  AdminAnalytics, 
  AnalyticsPeriod, 
  AnalyticsBookings, 
  AnalyticsShuttles, 
  AnalyticsRevenue, 
  BookingStatusCount, 
  ShuttleStatusCount 
} from "../types/graphql/Admin";
import { CreateEventInput, UpdateEventInput } from "../types/graphql/Event";
import { AdminLoginInput, LoginResponse } from "../types/graphql/Auth"; // NEW IMPORT
import bcrypt from "bcryptjs"; // Consider bcryptjs for compatibility
import jwt from "jsonwebtoken";

// Define Event and Shuttle GraphQL types derived from Prisma models for queries if not already present
// Assuming there are already existing Event/Shuttle types that can be reused
// For simplicity, directly using PrismaEvent and PrismaShuttle as return types for now,
// but in a real app, you'd have dedicated GraphQL types, potentially with relations.
// I will assume for now that EventResponse and ShuttleResponse from Admin are suitable or 
// there are generic Event/Shuttle types for queries.
// If the backend `Event` and `Shuttle` models are directly exposed via TypeGraphQL,
// then we can use those here. Let's assume there are corresponding GraphQL types.


// For the purpose of these queries, we will create simple GraphQL types if they don't exist
// Or reuse existing ones if they are compatible.
// Assuming Event and Shuttle are already defined as @ObjectType in some other file, 
// or I will define simple versions here.
// Given the PRISMA-based models are already here, we can derive TypeGraphQL types.

import { Event as GraphQLEvent } from "../types/graphql/Event"; // Assuming a GraphQL Event type exists
import { Shuttle as GraphQLShuttle } from "../types/graphql/Shuttle"; // Assuming a GraphQL Shuttle type exists


@Resolver()
export class AdminResolver {
  // ============ AUTHENTICATION ============
  @Mutation(() => LoginResponse)
  async adminLogin(
    @Arg("input") input: AdminLoginInput,
  ): Promise<LoginResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || user.role !== UserRole.ADMIN) { // Ensure user is an ADMIN
      throw new Error("Invalid credentials or not an admin");
    }

    // Assuming password is set and hashed
    if (!user.password || !(await bcrypt.compare(input.password, user.password))) {
      throw new Error("Invalid credentials");
    }

    // Generate JWT token (use a secure secret from environment variables)
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    logger.info(`Admin ${user.id} logged in successfully`);

    return { accessToken };
  }

  // ============ DASHBOARD STATS ============
  @Authorized("ADMIN")
  @Query(() => DashboardStats)
  async adminDashboard(@Ctx() ctx: Context): Promise<DashboardStats> {
    const totalUsers = await prisma.user.count();
    const totalSeekers = await prisma.user.count({ where: { role: "SEEKER" } });
    const totalDrivers = await prisma.user.count({ where: { role: "DRIVER" } });
    const totalOwners = await prisma.user.count({ where: { role: "OWNER" } });
    const totalEvents = await prisma.event.count();
    const activeEvents = await prisma.event.count({ where: { isActive: true } });
    const totalShuttles = await prisma.shuttle.count();
    const activeShuttles = await prisma.shuttle.count({
      where: { status: { in: ["SCHEDULED", "BOARDING", "IN_TRANSIT"] } },
    });
    const totalBookings = await prisma.booking.count();
    const completedBookings = await prisma.booking.count({
      where: { status: "COMPLETED" },
    });

    // Calculate revenue
    const completedBookingsData = await prisma.booking.findMany({
      where: { paymentStatus: "COMPLETED" },
      select: { totalPriceUsdc: true },
    });

    const totalRevenue = completedBookingsData.reduce(
      (sum, b) => sum + Number(b.totalPriceUsdc),
      0
    );

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthBookings = await prisma.booking.findMany({
      where: {
        paymentStatus: "COMPLETED",
        createdAt: { gte: monthAgo },
      },
      select: { totalPriceUsdc: true },
    });

    const monthRevenue = monthBookings.reduce(
      (sum, b) => sum + Number(b.totalPriceUsdc),
      0
    );

    const stats = new DashboardStats();
    stats.users = {
      total: totalUsers,
      seekers: totalSeekers,
      drivers: totalDrivers,
      owners: totalOwners,
    };
    stats.events = {
      total: totalEvents,
      active: activeEvents,
    };
    stats.shuttles = {
      total: totalShuttles,
      active: activeShuttles,
    };
    stats.bookings = {
      total: totalBookings,
      completed: completedBookings,
    };
    stats.revenue = {
      total: totalRevenue,
      month: monthRevenue,
    };
    
    return stats;
  }

  // ============ USER MANAGEMENT ============
  @Authorized("ADMIN")
  @Query(() => [UserWithProfiles])
  async adminUsers(
    @Arg("limit", () => Int, { nullable: true }) limit: number = 50,
    @Arg("offset", () => Int, { nullable: true }) offset: number = 0,
    @Arg("role", () => UserRole, { nullable: true }) role?: UserRole
  ): Promise<UserWithProfiles[]> {
    const where: Prisma.UserWhereInput = role ? { role } : {};
    const users = await prisma.user.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" as const },
      include: {
        driver: {
          include: {
            user: true,
          }
        },
        owner: true,
      },
    });

    return users.map((user) => ({
      ...user,
      driver: user.driver ? {
        ...user.driver,
        user: {
          ...user.driver.user,
          notificationSettings: JSON.parse(user.driver.user.notificationSettings as string),
          locationSettings: JSON.parse(user.driver.user.locationSettings as string),
        }
      } : null,
      owner: user.owner || null,
    }));
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async adminUpdateUserRole(
    @Arg("userId") userId: string,
    @Arg("role", () => String) role: UserRole,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    logger.info(`Admin ${ctx.userId} updated user ${userId} role to ${role}`);
    return true;
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async adminDeleteUser(@Arg("userId") userId: string, @Ctx() ctx: Context): Promise<boolean> {
    await prisma.user.delete({
      where: { id: userId },
    });

    logger.info(`Admin ${ctx.userId} deleted user ${userId}`);
    return true;
  }

  // ============ EVENT MANAGEMENT ============
  @Authorized("ADMIN")
  @Query(() => [GraphQLEvent]) // NEW QUERY
  async adminEvents(
    @Arg("limit", () => Int, { nullable: true }) limit: number = 50,
    @Arg("offset", () => Int, { nullable: true }) offset: number = 0,
    @Arg("filter", { nullable: true }) filter?: EventFilterInput // Assuming this type will be defined
  ): Promise<GraphQLEvent[]> {
    const where: Prisma.EventWhereInput = {};
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    // Add more filters as needed

    const events = await prisma.event.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { eventDate: "desc" },
    });
    // Map Prisma Event to GraphQL Event type if there are specific conversions needed
    // For now, assuming direct compatibility.
    return events as GraphQLEvent[];
  }

  @Authorized("ADMIN")
  @Mutation(() => EventResponse)
  async adminCreateEvent(
    @Arg("input") input: CreateEventInput, 
    @Ctx() ctx: Context
  ): Promise<EventResponse> {
    const location = typeof input.location === "string" ? JSON.parse(input.location) : input.location;

    const eventData: Prisma.EventCreateInput = {
      name: input.name,
      description: input.description ?? null,
      location: location as Prisma.InputJsonValue,
      eventDate: input.eventDate,
      eventType: input.eventType,
      imageUrl: input.imageUrl ?? null,
      isActive: true,
    };

    const event = await prisma.event.create({
      data: eventData,
    });

    logger.info(`Admin ${ctx.userId} created event ${event.id}`);
    
    // Convert PrismaEvent to EventResponse for GraphQL output
    const eventResponse = new EventResponse();
    Object.assign(eventResponse, event);
    return eventResponse;
  }

  @Authorized("ADMIN")
  @Mutation(() => EventResponse)
  async adminUpdateEvent(
    @Arg("eventId") eventId: string,
    @Arg("input") input: UpdateEventInput,
    @Ctx() ctx: Context
  ): Promise<EventResponse> {
    const updateData: any = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.location !== undefined) {
      updateData.location =
        typeof input.location === "string" ? JSON.parse(input.location) : input.location;
    }
    if (input.eventDate !== undefined) updateData.eventDate = input.eventDate;
    if (input.eventType !== undefined) updateData.eventType = input.eventType;
    if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const event = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });

    logger.info(`Admin ${ctx.userId} updated event ${eventId}`);
    
    // Convert PrismaEvent to EventResponse for GraphQL output
    const eventResponse = new EventResponse();
    Object.assign(eventResponse, event);
    return eventResponse;
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async adminDeleteEvent(@Arg("eventId") eventId: string, @Ctx() ctx: Context): Promise<boolean> {
    await prisma.event.delete({
      where: { id: eventId },
    });

    logger.info(`Admin ${ctx.userId} deleted event ${eventId}`);
    return true;
  }

  // ============ SHUTTLE MANAGEMENT ============
  @Authorized("ADMIN")
  @Query(() => [GraphQLShuttle]) // NEW QUERY
  async adminShuttles(
    @Arg("limit", () => Int, { nullable: true }) limit: number = 50,
    @Arg("offset", () => Int, { nullable: true }) offset: number = 0,
    @Arg("filter", { nullable: true }) filter?: ShuttleFilterInput // Assuming this type will be defined
  ): Promise<GraphQLShuttle[]> {
    const where: Prisma.ShuttleWhereInput = {};
    if (filter?.status !== undefined) {
      where.status = filter.status;
    }
    if (filter?.eventId !== undefined) {
      where.eventId = filter.eventId;
    }
    // Add more filters as needed

    const shuttles = await prisma.shuttle.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { departureTime: "desc" },
    });
    return shuttles as unknown as GraphQLShuttle[];
  }

  // @Authorized("ADMIN")
  // @Mutation(() => ShuttleResponse)
  // async adminCreateShuttle(
  //   @Arg("input") input: AdminCreateShuttleInput, 
  //   @Ctx() ctx: Context
  // ): Promise<ShuttleResponse> {
  //   // LocationInput is already structured, no need to parse JSON
  //   const pickupLocation = input.pickupLocation;
  //   const dropoffLocation = input.dropoffLocation;

  //   const shuttleData: Prisma.ShuttleCreateInput = {
  //     event: { connect: { id: input.eventId } },
  //     departureTime: input.departureTime,
  //     arrivalTime: input.arrivalTime,
  //     pickupLocation: pickupLocation as unknown as Prisma.InputJsonValue,
  //     dropoffLocation: dropoffLocation as unknown as Prisma.InputJsonValue,
  //     basePriceUsdc: String(input.basePriceUsdc),
  //     status: "SCHEDULED",
  //     ...(input.driverId && { driver: { connect: { id: input.driverId } } }),
  //   };

  //   const shuttle = await prisma.shuttle.create({
  //     data: shuttleData,
  //   });

  //   logger.info(`Admin ${ctx.userId} created shuttle ${shuttle.id}`);
    
  //   // Map PrismaShuttle to ShuttleResponse for GraphQL output
  //   const shuttleResponse = new ShuttleResponse();
  //   Object.assign(shuttleResponse, shuttle);
  //   return shuttleResponse;
  // }

  // @Authorized("ADMIN")
  // @Mutation(() => Boolean)
  // async adminUpdateShuttleStatus(
  //   @Arg("shuttleId") shuttleId: string,
  //   @Arg("status", () => ShuttleStatus) status: ShuttleStatus,
  //   @Ctx() ctx: Context
  // ): Promise<boolean> {
  //   await prisma.shuttle.update({
  //     where: { id: shuttleId },
  //     data: { status },
  //   });

  //   logger.info(`Admin ${ctx.userId} updated shuttle ${shuttleId} status to ${status}`);
  //   return true;
  // }

  // @Authorized("ADMIN")
  // @Mutation(() => Boolean)
  // async adminDeleteShuttle(@Arg("shuttleId") shuttleId: string, @Ctx() ctx: Context): Promise<boolean> {
  //   await prisma.shuttle.delete({
  //     where: { id: shuttleId },
  //   });

  //   logger.info(`Admin ${ctx.userId} deleted shuttle ${shuttleId}`);
  //   return true;
  // }

  // ============ BOOKING MANAGEMENT ============
@Query(() => [Booking])
async adminBookings(
  @Arg("limit", () => Int, { nullable: true }) limit: number = 50,
  @Arg("offset", () => Int, { nullable: true }) offset: number = 0,
  @Arg("status", () => BookingStatus, { nullable: true }) status?: BookingStatus,
  @Arg("paymentStatus", () => PaymentStatus, { nullable: true }) paymentStatus?: PaymentStatus
): Promise<Booking[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phoneNumber: true,
        },
      },
      shuttle: {
        include: {
          event: true,
        },
      },
    },
  });

  // Map the Prisma result to our GraphQL Booking type
  return bookings.map(booking => {
    const bookingResponse = new Booking();
    Object.assign(bookingResponse, {
      ...booking,
      // Ensure transactionHash is properly handled
      transactionHash: booking.transactionHash ?? undefined,
      // Map the nested shuttle if it exists
      shuttle: booking.shuttle ? {
        ...booking.shuttle,
        // Map any other nested fields if needed
      } : undefined
    });
    return bookingResponse;
  });
}

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async adminUpdateBookingStatus(
    @Arg("bookingId") bookingId: string,
    @Arg("status", () => BookingStatus) status: BookingStatus,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });

    logger.info(`Admin ${ctx.userId} updated booking ${bookingId} status to ${status}`);
    return true;
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async adminRefundBooking(@Arg("bookingId") bookingId: string, @Ctx() ctx: Context): Promise<boolean> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "REFUNDED",
        status: "CANCELLED",
      },
    });

    logger.info(`Admin ${ctx.userId} refunded booking ${bookingId}`);
    return true;
  }

  // ============ ANALYTICS ============
  @Authorized("ADMIN")
  @Query(() => AdminAnalytics)
  async adminAnalytics(
    @Arg("startDate", { nullable: true }) startDate?: Date,
    @Arg("endDate", { nullable: true }) endDate?: Date
  ): Promise<AdminAnalytics> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();

    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        shuttle: {
          include: {
            event: true,
          },
        },
      },
    });

    const revenue = bookings
      .filter((b) => b.paymentStatus === "COMPLETED")
      .reduce((sum, b) => sum + Number(b.totalPriceUsdc), 0);

    const bookingsByStatus = Object.entries(
      bookings.reduce((acc: Record<string, number>, b) => {
        acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([status, count]) => ({ status: status as BookingStatus, count }));

    const shuttles = await prisma.shuttle.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    const shuttlesByStatus = Object.entries(
      shuttles.reduce((acc: Record<string, number>, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([status, count]) => ({ status: status as ShuttleStatus, count }));

    const analytics = new AdminAnalytics();
    
    const period = new AnalyticsPeriod();
    period.start = start;
    period.end = end;
    analytics.period = period;
    
    const bookingsData = new AnalyticsBookings();
    bookingsData.total = bookings.length;
    bookingsData.byStatus = bookingsByStatus.map(b => {
      const statusCount = new BookingStatusCount();
      statusCount.status = b.status;
      statusCount.count = b.count;
      return statusCount;
    });
    analytics.bookings = bookingsData;
    
    const shuttlesData = new AnalyticsShuttles();
    shuttlesData.total = shuttles.length;
    shuttlesData.byStatus = shuttlesByStatus.map(s => {
      const statusCount = new ShuttleStatusCount();
      statusCount.status = s.status;
      statusCount.count = s.count;
      return statusCount;
    });
    
    const revenueData = new AnalyticsRevenue();
    revenueData.total = revenue;
    revenueData.currency = "USDC";
    analytics.revenue = revenueData;

    return analytics;
  }
}