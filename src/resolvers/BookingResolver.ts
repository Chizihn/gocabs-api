import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  FieldResolver,
  Root,
  Int,
  UseMiddleware,
} from "type-graphql";
import {
  Booking,
  BookingResponse,
  CreateBookingInput,
} from "../types/graphql/Booking";
import { Shuttle } from "../types/graphql/Shuttle";
import type { Context } from "../types/Context";
import { prisma } from "../config/database";
import { BookingService } from "../services/booking/BookingService";
import { BookingStatus } from "@prisma/client";
import { NFTGate } from "../middleware/nftGate";

@Resolver(() => Booking)
export class BookingResolver {
  @Authorized("NFT_HOLDER")
  @UseMiddleware(NFTGate)
  @Mutation(() => BookingResponse)
  async createBooking(
    @Arg("input") input: CreateBookingInput,
    @Ctx() ctx: Context
  ): Promise<BookingResponse> {
    const { booking, payment } = await BookingService.createBooking({
      userId: ctx.userId!,
      shuttleId: input.shuttleId,
      seats: input.seats,
    });

    return {
      booking: booking as Booking,
      paymentUrl: payment.url,
      reference: payment.reference,
      // expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
  }

  @Mutation(() => Boolean)
  async confirmPayment(
    @Arg("bookingId") bookingId: string,
    @Arg("signature") signature: string,
    @Arg("reference") reference: string
  ): Promise<boolean> {
    await BookingService.confirmPayment(bookingId, signature, reference);
    return true;
  }

  @Authorized()
  @UseMiddleware(NFTGate)
  @Query(() => [Booking])
  async myBookings(@Ctx() ctx: Context): Promise<Booking[]> {
    const bookings = await prisma.booking.findMany({
      where: { userId: ctx.userId! },
      include: { shuttle: { include: { event: true } } },
      orderBy: { createdAt: "desc" },
    });

    return bookings as any;
  }

  @Authorized()
  @Query(() => Booking, { nullable: true })
  async booking(
    @Arg("id") id: string,
    @Ctx() ctx: Context
  ): Promise<Booking | null> {
    const booking = await prisma.booking.findFirst({
      where: { id, userId: ctx.userId! },
      include: { shuttle: { include: { event: true } } },
    });

    return booking as any;
  }

  @Authorized()
  @Mutation(() => Boolean)
  async cancelBooking(
    @Arg("bookingId") bookingId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    return BookingService.cancelBooking(bookingId, ctx.userId!);
  }

  @Authorized()
  @Mutation(() => Boolean)
  async rateBooking(
    @Arg("bookingId") bookingId: string,
    @Arg("rating", () => Int) rating: number,
    @Ctx() ctx: Context,
    @Arg("review", { nullable: true }) review?: string
  ): Promise<boolean> {
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        userId: ctx.userId!,
        status: BookingStatus.COMPLETED,
      },
    });

    if (!booking) {
      throw new Error("Completed booking not found or access denied");
    }

    // Create the update data object with proper typing
    const updateData: any = { rating };
    // Only include review in the update if it's provided
    if (review !== undefined) {
      updateData.review = review;
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
    });

    // If there's an associated shuttle with a driver, update their rating
    if (booking.shuttleId) {
      await BookingResolver.updateDriverRating(booking.shuttleId);
    }

    return true;
  }

  private static async updateDriverRating(shuttleId: string) {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: { driver: true },
    });

    if (!shuttle?.driver) return;

    const ratingAgg = await prisma.booking.aggregate({
      where: {
        shuttleId,
        rating: { not: null },
      },
      _avg: {
        rating: true,
      },
    });

    if (ratingAgg._avg.rating) {
      await prisma.driver.update({
        where: { id: shuttle.driver.id },
        data: { rating: new Number(ratingAgg._avg.rating).valueOf() },
      });
    }
  }

  @Authorized()
  @Query(() => [Booking])
  async getShuttleBookings(@Arg("shuttleId" ) shuttleId: string) {
    return prisma.booking.findMany({
      where: { shuttleId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });
  }

  @FieldResolver(() => Shuttle)
  async shuttle(@Root() booking: Booking) {
    return prisma.shuttle.findUnique({
      where: { id: booking.shuttleId },
      include: {
        event: true,
        driver: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });
  }

  @FieldResolver(() => Boolean, { nullable: true })
  async hasReward(@Root() booking: Booking) {
    const reward = await prisma.reward.findUnique({
      where: { bookingId: booking.id },
    });
    return !!reward;
  }

  @FieldResolver(() => String, { nullable: true })
  async rewardStatus(@Root() booking: Booking) {
    const reward = await prisma.reward.findUnique({
      where: { bookingId: booking.id },
    });
    return reward?.claimed ? "CLAIMED" : reward ? "AVAILABLE" : "NONE";
  }
}
