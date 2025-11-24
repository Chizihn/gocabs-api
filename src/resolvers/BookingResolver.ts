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
  ObjectType,
  Field,
} from "type-graphql";
import {
  Booking,
  BookingResponse,
  CreateBookingInput,
  PaginatedBookingsResponse,
} from "../types/graphql/Booking";
import { Shuttle } from "../types/graphql/Shuttle";
import type { Context } from "../types/Context";
import { prisma } from "../config/database";
import { BookingService } from "../services/booking/BookingService";
import { BookingStatus, Prisma } from "@prisma/client";
// import { NFTGate } from "../middleware/nftGate";
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { logger } from "../utils/logger";

@ObjectType()
class FindAndConfirmPaymentResponse extends BaseResponse {
  @Field(() => Booking, { nullable: true })
  booking?: Booking;
}

@ObjectType()
class NFTMetadata {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  image?: string;
}

@ObjectType()
class OwnedNFT {
  @Field()
  mintAddress: string;

  @Field(() => NFTMetadata, { nullable: true })
  metadata?: NFTMetadata;
}

@ObjectType()
class MyOwnedNftsResponse {
  @Field(() => [OwnedNFT])
  nfts: OwnedNFT[];
}

@Resolver(() => Booking)
export class BookingResolver {
  // @Authorized("NFT_HOLDER")
  // @UseMiddleware(NFTGate)
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

  @Mutation(() => BaseResponse)
  async confirmPayment(
    @Arg("bookingId") bookingId: string,
    @Arg("signature") signature: string,
    @Arg("reference") reference: string
  ): Promise<BaseResponse> {
    logger.info(
      `[ConfirmPayment] Mutation called for bookingId: ${bookingId}, reference: ${reference}`
    );
    try {
      // OLD, RISKY WAY: This tries to confirm the payment immediately and can fail.
      // await BookingService.confirmPayment(bookingId, signature, reference);

      // NEW, ROBUST WAY: Just save the signature and let the background worker handle confirmation.
      // This is much more reliable for the user.
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        throw new Error("Booking not found.");
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          transactionHash: signature,
          paymentStatus: "PROCESSING", // Mark as processing
        },
      });

      logger.info(
        `[ConfirmPayment] Payment signature for booking ${bookingId} has been queued for confirmation.`
      );
      return {
        success: true,
        message:
          "Your payment is being confirmed. Your booking will be updated shortly.",
      };
    } catch (error: any) {
      logger.error(
        `[ConfirmPayment] Error for bookingId: ${bookingId}:`,
        error
      );
      return {
        success: false,
        message: error.message || "Failed to queue payment for confirmation.",
      };
    }
  }

  // No @Authorized() - this is called from polling and doesn't need auth
  @Mutation(() => FindAndConfirmPaymentResponse)
  async findAndConfirmPayment(
    @Arg("reference") reference: string
  ): Promise<FindAndConfirmPaymentResponse> {
    logger.info(
      `[FindAndConfirmPayment] Mutation called for reference: ${reference}`
    );
    try {
      const booking = await BookingService.findAndConfirmPaymentByReference(
        reference
      );
      if (booking) {
        logger.info(
          `[FindAndConfirmPayment] Successfully found and confirmed payment for reference: ${reference}`
        );
        return {
          success: true,
          message: "Payment found and confirmed successfully.",
          booking: booking as Booking,
        };
      } else {
        // Transaction not found yet on blockchain
        return {
          success: false,
          message: "Transaction not found yet. Please wait and try again.",
        };
      }
    } catch (error: any) {
      logger.error(
        `[FindAndConfirmPayment] Error for reference: ${reference}:`,
        error
      );
      return {
        success: false,
        message: error.message || "Failed to find and confirm payment.",
      };
    }
  }

  @Authorized()
  @Query(() => MyOwnedNftsResponse)
  async myOwnedNfts(@Ctx() ctx: Context): Promise<MyOwnedNftsResponse> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      select: { walletAddress: true },
    });

    if (!user || !user.walletAddress) {
      logger.warn(`myOwnedNfts: User ${ctx.userId!} has no wallet address.`);
      return { nfts: [] };
    }

    try {
      // This performs a live check of the user's wallet
      const { nftTokens } = await NFTVerificationService.verifyNFTOwnership(
        user.walletAddress
      );

      // Fetch metadata for each NFT in parallel
      const nftsWithMetadata = await Promise.all(
        nftTokens.map(async (mintAddress) => {
          const metadata = await NFTVerificationService.getNFTMetadata(
            mintAddress
          );
          return { mintAddress, metadata };
        })
      );

      return { nfts: nftsWithMetadata };
    } catch (error) {
      logger.error(
        `myOwnedNfts: Error fetching NFTs for wallet ${user.walletAddress}`,
        error
      );
      return { nfts: [] };
    }
  }

  @Authorized()
  // @UseMiddleware(NFTGate)
  @Query(() => PaginatedBookingsResponse)
  async myBookings(
    @Ctx() ctx: Context,
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput
  ): Promise<PaginatedBookingsResponse> {
    const where: Prisma.BookingWhereInput = {
      userId: ctx.userId!,
      // Exclude bookings that are cancelled or have a failed payment
      status: { not: BookingStatus.CANCELLED },
      paymentStatus: { not: "FAILED" },
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
        include: { shuttle: { include: { event: true } } },
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
  @Mutation(() => BaseResponse)
  async cancelBooking(
    @Arg("bookingId") bookingId: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      const success = await BookingService.cancelBooking(
        bookingId,
        ctx.userId!
      );
      if (success) {
        return { success: true, message: "Booking cancelled successfully." };
      }
      return {
        success: false,
        message:
          "Failed to cancel booking. It may not exist or is not eligible for cancellation.",
      };
    } catch (error: any) {
      return {
        success: false,
        message:
          error.message || "An unexpected error occurred during cancellation.",
      };
    }
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async rateBooking(
    @Arg("bookingId") bookingId: string,
    @Arg("rating", () => Int) rating: number,
    @Ctx() ctx: Context,
    @Arg("review", { nullable: true }) review?: string
  ): Promise<BaseResponse> {
    try {
      if (rating < 1 || rating > 5) {
        return { success: false, message: "Rating must be between 1 and 5." };
      }

      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          userId: ctx.userId!,
          status: BookingStatus.COMPLETED,
        },
      });

      if (!booking) {
        return {
          success: false,
          message: "Completed booking not found or access denied.",
        };
      }

      const updateData: any = { rating };
      if (review !== undefined) {
        updateData.review = review;
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: updateData,
      });

      if (booking.shuttleId) {
        await BookingResolver.updateDriverRating(booking.shuttleId);
      }
      return { success: true, message: "Thank you for your feedback!" };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Failed to submit rating.",
      };
    }
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
  async getShuttleBookings(
    @Arg("shuttleId") shuttleId: string,
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput
  ): Promise<PaginatedBookingsResponse> {
    const where = { shuttleId };
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
            select: {
              id: true,
              username: true,
              email: true,
              phoneNumber: true,
            },
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
