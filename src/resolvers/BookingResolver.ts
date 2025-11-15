import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  FieldResolver,
  Root,
} from "type-graphql";
import {
  Booking,
  BookingResponse,
  CreateBookingInput,
} from "../types/graphql/Booking";
import { Shuttle } from "../types/graphql/Shuttle";
import { SolanaPayService } from "../services/blockchain/SolanaPayService";
import { RewardCalculationService } from "../services/rewards/RewardCalculationService";
import { BookingService } from "../services/booking/BookingService";
import type { Context } from "../types/Context";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Decimal } from "@prisma/client/runtime/library";

@Resolver(() => Booking)
export class BookingResolver {
  private solanaPayService: SolanaPayService;

  constructor() {
    this.solanaPayService = new SolanaPayService();
  }

  @Authorized("NFT_HOLDER")
  @Mutation(() => BookingResponse)
  async createBooking(
    @Arg("input") input: CreateBookingInput,
    @Ctx() ctx: Context
  ): Promise<BookingResponse> {
    const { shuttleId, numberOfSeats } = input;

    // Verify shuttle availability
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: { bookings: true, event: true },
    });

    if (!shuttle) throw new Error("Shuttle not found");
    if (shuttle.status === "CANCELLED") throw new Error("Shuttle is cancelled");

    const bookedSeats = shuttle.bookings
      .filter((b: { status: string }) => b.status !== "CANCELLED")
      .reduce((sum: number, b: { numberOfSeats: number }) => sum + b.numberOfSeats, 0);

    if (bookedSeats + numberOfSeats > shuttle.capacity) {
      throw new Error("Not enough seats available");
    }

    // Calculate price using Decimal
    const basePrice = new Decimal(shuttle.basePrice.toString());
    const totalPrice = basePrice.mul(numberOfSeats);

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        userId: ctx.userId!,
        shuttleId,
        numberOfSeats,
        totalPrice,
        paymentStatus: "PENDING",
        status: "CONFIRMED",
      },
      include: { shuttle: { include: { event: true } } },
    });

    // Generate payment request (convert Decimal to number for Solana Pay)
    const totalPriceNumber = totalPrice.toNumber();
    const reference = Keypair.generate().publicKey;
    const { url } = await this.solanaPayService.createPaymentRequest(
      totalPriceNumber,
      reference,
      "GoCabs Shuttle Booking",
      `${shuttle.vehicleNumber} - ${shuttle.event.name}`
    );

    logger.info(`Booking created: ${booking.id} for user ${ctx.userId}`);

    return {
      booking: booking as any,
      paymentUrl: url,
      reference: reference.toString(),
    };
  }

  @Mutation(() => Boolean)
  async confirmPayment(
    @Arg("bookingId") bookingId: string,
    @Arg("signature") signature: string,
    @Arg("reference") reference: string
  ): Promise<boolean> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new Error("Booking not found");
    if (booking.paymentStatus === "COMPLETED") {
      logger.warn(`Payment already confirmed for booking ${bookingId}`);
      return true;
    }

    // Verify transaction (convert Decimal to number)
    const totalPriceNumber = new Decimal(booking.totalPrice.toString()).toNumber();
    const isValid = await this.solanaPayService.verifyTransaction(
      signature,
      new PublicKey(reference),
      totalPriceNumber
    );

    if (!isValid) throw new Error("Payment verification failed");

    // Update booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "COMPLETED",
        transactionHash: signature,
      },
    });

    // Generate rewards
    try {
      await RewardCalculationService.generateReward(bookingId);
    } catch (error) {
      logger.error("Failed to generate reward:", error);
      // Don't fail the payment confirmation if reward generation fails
    }

    logger.info(`Payment confirmed for booking ${bookingId}`);
    return true;
  }

  @Authorized()
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
    @Arg("rating") rating: number,
    @Arg("review", () => String, { nullable: true }) review: string | undefined,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }
    return BookingService.rateBooking(bookingId, ctx.userId!, rating, review);
  }

  @FieldResolver(() => Shuttle)
  async shuttle(@Root() booking: Booking): Promise<Shuttle> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: booking.shuttleId },
      include: { event: true, bookings: true },
    });

    if (!shuttle) throw new Error("Shuttle not found");

    const bookedSeats = shuttle.bookings
      .filter((b: { status: string }) => b.status !== "CANCELLED")
      .reduce((sum: number, b: { numberOfSeats: number }) => sum + b.numberOfSeats, 0);

    return {
      ...shuttle,
      pickupLocation: shuttle.pickupLocation as any,
      dropoffLocation: shuttle.dropoffLocation as any,
      currentLocation: shuttle.currentLocation as any,
      availableSeats: shuttle.capacity - bookedSeats,
    } as any;
  }
}
