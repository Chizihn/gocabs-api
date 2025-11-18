import {
  BookingStatus,
  PaymentStatus,
  Prisma,
  ShuttleStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PublicKey, Keypair } from "@solana/web3.js";
import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";
import { SolanaPayService } from "../blockchain/SolanaPayService";
import { RewardCalculationService } from "../rewards/RewardCalculationService";
import { NotificationService } from "../notification/NotificationService";

const solanaPay = new SolanaPayService();

interface CreateBookingParams {
  userId: string;
  shuttleId: string;
  seats: number;
}

export class BookingService {
  static async ensureAvailability(shuttleId: string, seats: number) {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      select: { id: true, availableSeats: true, status: true },
    });

    if (!shuttle) throw new Error("Shuttle not found");
    if (shuttle.status === ShuttleStatus.CANCELLED) {
      throw new Error("Shuttle has been cancelled");
    }
    if ((shuttle.availableSeats ?? 0) < seats) {
      throw new Error("Not enough seats available");
    }
  }

  static async createBooking({
    userId,
    shuttleId,
    seats,
  }: CreateBookingParams) {
    await this.ensureAvailability(shuttleId, seats);

    return prisma.$transaction(async (tx) => {
      const shuttle = await tx.shuttle.findUniqueOrThrow({
        where: { id: shuttleId },
        include: {
          event: true,
        },
      });

      const price = new Decimal(shuttle.basePriceUsdc.toString()).mul(seats);

      const booking = await tx.booking.create({
        data: {
          userId,
          shuttleId,
          seats,
          totalPriceUsdc: price,
          paymentStatus: PaymentStatus.PENDING,
          status: BookingStatus.CONFIRMED,
        },
        include: {
          shuttle: {
            include: {
              event: true,
            },
          },
        },
      });

      await tx.shuttle.update({
        where: { id: shuttleId },
        data: {
          availableSeats: shuttle.availableSeats - seats,
        },
      });

      const reference = Keypair.generate().publicKey;
      const paymentRequest = await solanaPay.createPaymentRequest(
        price.toNumber(),
        reference,
        "GoCabs Shuttle Booking",
        `${shuttle.licensePlate} - ${shuttle.event.name}`
      );

      return {
        booking,
        payment: paymentRequest,
      };
    });
  }

  static async confirmPayment(
    bookingId: string,
    signature: string,
    reference: string
  ) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          shuttle: {
            include: { event: true },
          },
          user: true,
        },
      });

      if (!booking) throw new Error("Booking not found");
      if (booking.paymentStatus === PaymentStatus.COMPLETED) {
        return booking;
      }

      const isValid = await solanaPay.verifyTransaction(
        signature,
        new PublicKey(reference),
        booking.totalPriceUsdc.toNumber()
      );

      if (!isValid) throw new Error("Payment verification failed");

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          status: BookingStatus.CONFIRMED,
          transactionHash: signature,
        },
      });

      await RewardCalculationService.generateReward(bookingId);

      await NotificationService.sendBookingConfirmation(
        booking.userId,
        bookingId,
        booking.shuttle.event?.name || "Your event"
      );

      logger.info(`Payment confirmed for booking ${bookingId}`);
      return updated;
    });
  }

  static async cancelBooking(bookingId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        include: { shuttle: true },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      if (
        booking.paymentStatus === PaymentStatus.COMPLETED &&
        booking.status === BookingStatus.COMPLETED
      ) {
        throw new Error("Completed bookings cannot be cancelled");
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.REFUNDED,
        },
      });

      await tx.shuttle.update({
        where: { id: booking.shuttleId },
        data: {
          availableSeats: (booking.shuttle.availableSeats ?? 0) + booking.seats,
        },
      });

      return true;
    });
  }

  static async rateBooking(
    bookingId: string,
    userId: string,
    rating: number,
    review?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: bookingId,
          userId,
          status: BookingStatus.COMPLETED,
        },
        include: {
          shuttle: {
            include: { driver: true },
          },
        },
      });

      if (!booking) {
        throw new Error("Booking not found or not completed");
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          rating,
          review: review ?? null,
        },
      });

      if (booking.shuttle?.driver) {
        const ratings = await tx.booking.findMany({
          where: {
            shuttle: { driverId: booking.shuttle.driver.id },
            rating: { not: null },
          },
          select: { rating: true },
        });

        if (ratings.length) {
          const avg =
            ratings.reduce((sum, b) => sum + (b.rating || 0), 0) /
            ratings.length;
          await tx.driver.update({
            where: { id: booking.shuttle.driver.id },
            data: { rating: new Decimal(avg.toFixed(2)) },
          });
        }
      }

      return true;
    });
  }
}
