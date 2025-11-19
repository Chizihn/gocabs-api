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

// Helper: Compute available seats dynamically
const getAvailableSeats = async (shuttleId: string): Promise<number> => {
  const shuttle = await prisma.shuttle.findUnique({
    where: { id: shuttleId },
    include: { vehicle: true },
  });

  if (!shuttle) throw new Error("Shuttle not found");

  const booked = await prisma.booking.count({
    where: {
      shuttleId,
      status: { in: ["CONFIRMED", "PICKED_UP"] },
    },
  });

  return shuttle.vehicle.capacity - booked;
};

export class BookingService {
  static async ensureAvailability(shuttleId: string, seats: number) {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: { vehicle: true },
    });

    if (!shuttle) throw new Error("Shuttle not found");
    if (shuttle.status === ShuttleStatus.CANCELLED) {
      throw new Error("Shuttle has been cancelled");
    }

    const available = shuttle.vehicle.capacity - await prisma.booking.count({
      where: { shuttleId, status: { in: ["CONFIRMED", "PICKED_UP"] } },
    });

    if (available < seats) {
      throw new Error(`Only ${available} seats available`);
    }
  }

  static async createBooking({ userId, shuttleId, seats }: CreateBookingParams) {
    await this.ensureAvailability(shuttleId, seats);

    return prisma.$transaction(async (tx) => {
      const shuttle = await tx.shuttle.findUniqueOrThrow({
        where: { id: shuttleId },
        include: {
          vehicle: true,
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
              vehicle: true,
            },
          },
          user: true,
        },
      });

      // Generate Solana Pay link
      const reference = Keypair.generate().publicKey;
      const memo = `${shuttle.vehicle.licensePlate} → ${shuttle.event.name} (${seats} seat${seats > 1 ? "s" : ""})`;

      const paymentRequest = await solanaPay.createPaymentRequest(
        price.toNumber(),
        reference,
        "GoCab Shuttle Booking",
        memo
      );

      logger.info(`Booking created: ${booking.id} | ${seats} seats | ${price.toFixed(2)} USDC`);

      return {
        booking,
        payment: paymentRequest,
      };
    });
  }

  static async confirmPayment(bookingId: string, signature: string, reference: string) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          shuttle: {
            include: {
              event: true,
              vehicle: true,
            },
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

      if (!isValid) {
        throw new Error("Invalid payment signature");
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          transactionHash: signature,
        },
      });

      // Generate reward
      await RewardCalculationService.generateReward(bookingId);

      // Notify user
      await NotificationService.sendBookingConfirmation(
        booking.userId,
        bookingId,
        booking.shuttle.event.name
      );

      logger.info(`Payment confirmed: ${bookingId} | Tx: ${signature}`);

      return updated;
    });
  }

  static async cancelBooking(bookingId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        include: { shuttle: true },
      });

      if (!booking) throw new Error("Booking not found");

      if (booking.status === BookingStatus.COMPLETED) {
        throw new Error("Completed rides cannot be cancelled");
      }

      if (booking.paymentStatus === PaymentStatus.COMPLETED) {
        // TODO: Trigger refund via Solana
        logger.warn(`Refund needed for booking ${bookingId}`);
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          paymentStatus: booking.paymentStatus === PaymentStatus.COMPLETED
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        },
      });

      await NotificationService.sendBookingCancelled(userId, bookingId);

      logger.info(`Booking cancelled: ${bookingId}`);
      return true;
    });
  }

  static async rateBooking(
    bookingId: string,
    userId: string,
    rating: number,
    review?: string
  ) {
    if (rating < 1 || rating > 5) throw new Error("Rating must be 1–5");

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

      if (!booking) throw new Error("Booking not eligible for rating");

      await tx.booking.update({
        where: { id: bookingId },
        data: { rating, review: review || null },
      });

      if (booking.shuttle.driver) {
        const ratings = await tx.booking.findMany({
          where: {
            shuttle: { driverId: booking.shuttle.driver.id },
            rating: { not: null },
          },
          select: { rating: true },
        });

        if (ratings.length > 0) {
          const avg = ratings.reduce((sum, b) => sum + b.rating!, 0) / ratings.length;
          await tx.driver.update({
            where: { id: booking.shuttle.driver.id },
            data: { rating: new Decimal(avg.toFixed(2)) },
          });
        }
      }

      logger.info(`Rating submitted: ${bookingId} → ${rating} stars`);
      return true;
    });
  }
}