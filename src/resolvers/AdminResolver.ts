import "reflect-metadata"; // Ensure this is at the top if needed by TypeGraphQL
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
import {
  UserRole,
  ShuttleStatus,
  BookingStatus,
  PaymentStatus,
  Prisma,
  User,
  Event as PrismaEvent,
  Shuttle as PrismaShuttle,
} from "@prisma/client";
import {
  AdminCreateShuttleInput,
  DashboardStats,
  UserWithProfiles,
  EventResponse,
  ShuttleResponse,
  EventFilterInput,
  ShuttleFilterInput,
  PaginatedAdminUsersResponse,
  PaginatedAdminEventsResponse,
  PaginatedAdminShuttlesResponse,
  PaginatedAdminBookingsResponse,
} from "../types/graphql/Admin"; // Assuming EventFilterInput and ShuttleFilterInput will be added
import { Booking } from "../types/graphql/Booking";
import {
  AdminAnalytics,
  AnalyticsPeriod,
  AnalyticsBookings,
  AnalyticsShuttles,
  AnalyticsRevenue,
  BookingStatusCount,
  ShuttleStatusCount,
} from "../types/graphql/Admin";
import { CreateEventInput, UpdateEventInput } from "../types/graphql/Event";
import { AdminLoginInput, LoginResponse } from "../types/graphql/Auth"; // NEW IMPORT
import bcrypt from "bcryptjs";
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";
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
    @Arg("input") input: AdminLoginInput
  ): Promise<LoginResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      // Ensure user is an ADMIN
      throw new Error("Invalid credentials or not an admin");
    }

    // Assuming password is set and hashed
    if (
      !user.password ||
      !(await bcrypt.compare(input.password, user.password))
    ) {
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
    const activeEvents = await prisma.event.count({
      where: { isActive: true },
    });
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
  @Query(() => PaginatedAdminUsersResponse)
  async adminUsers(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput,
    @Arg("role", () => UserRole, { nullable: true }) role?: UserRole
  ): Promise<PaginatedAdminUsersResponse> {
    const where: Prisma.UserWhereInput = role ? { role } : {};
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { createdAt: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
        include: { driver: true, owner: true },
      }),
      prisma.user.count({ where }),
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

  @Authorized("ADMIN")
  @Mutation(() => BaseResponse)
  async adminUpdateUserRole(
    @Arg("userId") userId: string,
    @Arg("role", () => String) role: UserRole,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      logger.info(`Admin ${ctx.userId} updated user ${userId} role to ${role}`);
      return { success: true, message: "User role updated successfully." };
    } catch (error: any) {
      logger.error(`Failed to update role for user ${userId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to update user role.",
      };
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => BaseResponse)
  async adminDeleteUser(
    @Arg("userId") userId: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      await prisma.user.delete({
        where: { id: userId },
      });
      logger.info(`Admin ${ctx.userId} deleted user ${userId}`);
      return { success: true, message: "User deleted successfully." };
    } catch (error: any) {
      logger.error(`Failed to delete user ${userId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to delete user.",
      };
    }
  }

  // ============ EVENT MANAGEMENT ============
  @Authorized("ADMIN")
  @Query(() => PaginatedAdminEventsResponse) // NEW QUERY
  async adminEvents(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput,
    @Arg("filter", { nullable: true }) filter?: EventFilterInput // Assuming this type will be defined
  ): Promise<PaginatedAdminEventsResponse> {
    const where: Prisma.EventWhereInput = {};
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    // Add more filters as needed
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { eventDate: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.event.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
      }),
      prisma.event.count({ where }),
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

  @Authorized("ADMIN")
  @Mutation(() => EventResponse)
  async adminCreateEvent(
    @Arg("input") input: CreateEventInput,
    @Ctx() ctx: Context
  ): Promise<EventResponse> {
    const location =
      typeof input.location === "string"
        ? JSON.parse(input.location)
        : input.location;

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
    if (input.description !== undefined)
      updateData.description = input.description;
    if (input.location !== undefined) {
      updateData.location =
        typeof input.location === "string"
          ? JSON.parse(input.location)
          : input.location;
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
  @Mutation(() => BaseResponse)
  async adminDeleteEvent(
    @Arg("eventId") eventId: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      await prisma.event.delete({
        where: { id: eventId },
      });
      logger.info(`Admin ${ctx.userId} deleted event ${eventId}`);
      return { success: true, message: "Event deleted successfully." };
    } catch (error: any) {
      logger.error(`Failed to delete event ${eventId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to delete event.",
      };
    }
  }

  // ============ SHUTTLE MANAGEMENT ============
  @Authorized("ADMIN")
  @Query(() => PaginatedAdminShuttlesResponse) // NEW QUERY
  async adminShuttles(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput,
    @Arg("filter", { nullable: true }) filter?: ShuttleFilterInput // Assuming this type will be defined
  ): Promise<PaginatedAdminShuttlesResponse> {
    const where: Prisma.ShuttleWhereInput = {};
    if (filter?.status !== undefined) {
      where.status = filter.status;
    }
    if (filter?.eventId !== undefined) {
      where.eventId = filter.eventId;
    }
    // Add more filters as needed
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { departureTime: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.shuttle.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
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
  @Authorized("ADMIN")
  @Query(() => PaginatedAdminBookingsResponse)
  async adminBookings(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput,
    @Arg("status", () => BookingStatus, { nullable: true })
    status?: BookingStatus,
    @Arg("paymentStatus", () => PaymentStatus, { nullable: true })
    paymentStatus?: PaymentStatus
  ): Promise<PaginatedAdminBookingsResponse> {
    const where: Prisma.BookingWhereInput = {
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
    };
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { createdAt: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
        include: {
          user: {
            select: { id: true, email: true, phoneNumber: true },
          },
          shuttle: {
            include: { event: true },
          },
        },
      }),
      prisma.booking.count({ where }),
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

  @Authorized("ADMIN")
  @Mutation(() => BaseResponse)
  async adminUpdateBookingStatus(
    @Arg("bookingId") bookingId: string,
    @Arg("status", () => BookingStatus) status: BookingStatus,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status },
      });
      logger.info(
        `Admin ${ctx.userId} updated booking ${bookingId} status to ${status}`
      );
      return { success: true, message: `Booking status updated to ${status}.` };
    } catch (error: any) {
      logger.error(`Failed to update booking ${bookingId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to update booking status.",
      };
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => BaseResponse)
  async adminRefundBooking(
    @Arg("bookingId") bookingId: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        return { success: false, message: "Booking not found." };
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: "REFUNDED",
          status: "CANCELLED",
        },
      });

      logger.info(`Admin ${ctx.userId} refunded booking ${bookingId}`);
      return {
        success: true,
        message: "Booking refunded and cancelled successfully.",
      };
    } catch (error: any) {
      logger.error(`Failed to refund booking ${bookingId}:`, error);
      return {
        success: false,
        message: error.message || "Failed to refund booking.",
      };
    }
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
    bookingsData.byStatus = bookingsByStatus.map((b) => {
      const statusCount = new BookingStatusCount();
      statusCount.status = b.status;
      statusCount.count = b.count;
      return statusCount;
    });
    analytics.bookings = bookingsData;

    const shuttlesData = new AnalyticsShuttles();
    shuttlesData.total = shuttles.length;
    shuttlesData.byStatus = shuttlesByStatus.map((s) => {
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
