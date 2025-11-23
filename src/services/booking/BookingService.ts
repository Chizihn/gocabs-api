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

let solanaPay: SolanaPayService;

const getSolanaPay = () => {
  if (!solanaPay) {
    solanaPay = new SolanaPayService();
  }
  return solanaPay;
};

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

    // Calculate seats taken by confirmed bookings
    const confirmedSeats = await prisma.booking.aggregate({
      where: { shuttleId, status: { in: ["CONFIRMED", "PICKED_UP"] } },
      _sum: { seats: true },
    });

    // Calculate seats taken by recent, unpaid bookings (e.g., within 10 mins)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const pendingSeats = await prisma.booking.aggregate({
      where: {
        shuttleId,
        status: "PENDING",
        createdAt: { gte: tenMinutesAgo },
      },
      _sum: { seats: true },
    });

    const available =
      shuttle.vehicle.capacity -
      (confirmedSeats._sum.seats || 0) -
      (pendingSeats._sum.seats || 0);

    if (available < seats) {
      throw new Error(`Only ${available} seats available`);
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
          vehicle: true,
          event: true,
        },
      });

      const price = new Decimal(shuttle.basePriceUsdc.toString()).mul(seats);

      // Generate Solana Pay reference *before* creating the booking
      const reference = Keypair.generate().publicKey;

      const booking = await tx.booking.create({
        data: {
          userId,
          shuttleId,
          seats,
          totalPriceUsdc: price,
          paymentStatus: PaymentStatus.PENDING,
          status: BookingStatus.PENDING, // Set initial status to PENDING
          paymentReference: reference.toBase58(), // Save the reference here
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

      const memo = `${shuttle.vehicle.licensePlate} → ${
        shuttle.event.name
      } (${seats} seat${seats > 1 ? "s" : ""})`;

      const paymentRequest = await getSolanaPay().createPaymentRequest(
        price.toNumber(),
        reference,
        "GoCab Shuttle Booking",
        memo,
        booking.id
      );

      logger.info(
        `Booking created: ${booking.id} | ${seats} seats | ${price.toFixed(
          2
        )} USDC`
      );

      return {
        booking,
        payment: paymentRequest,
      };
    });
  }

  static async findAndConfirmPaymentByReference(reference: string) {
    logger.info(
      `[findAndConfirmPaymentByReference] Searching for tx with reference: ${reference}`
    );

    const referencePublicKey = new PublicKey(reference);

    // Find the signature from the blockchain
    const signatures = await getSolanaPay().connection.getSignaturesForAddress(
      referencePublicKey,
      { limit: 1 }
    );

    if (signatures.length === 0) {
      logger.info(
        `[findAndConfirmPaymentByReference] No signature found yet for reference: ${reference}`
      );
      return null; // Not found yet, client should retry
    }

    const firstSignatureInfo = signatures[0];
    if (!firstSignatureInfo) {
      // This case is unlikely if length > 0, but it satisfies TypeScript's strictness
      return null;
    }
    const signature = firstSignatureInfo.signature;
    logger.info(
      `[findAndConfirmPaymentByReference] Found signature ${signature} for reference: ${reference}`
    );

    // Find the booking associated with this reference with retry logic
    let booking = null;
    let retries = 3;
    while (retries > 0 && !booking) {
      try {
        booking = await prisma.booking.findUnique({
          where: { paymentReference: reference },
        });
        if (!booking) {
          throw new Error("Booking not found for this payment reference.");
        }
      } catch (error: any) {
        retries--;
        if (error.message?.includes("connection pool") || error.message?.includes("timeout")) {
          logger.warn(
            `[findAndConfirmPaymentByReference] Connection pool error, retrying... (${retries} retries left)`
          );
          if (retries > 0) {
            // Wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
        }
        throw error;
      }
    }

    if (!booking) {
      throw new Error("Booking not found for this payment reference.");
    }

    // Now that we have all the pieces, call the original confirmation logic
    return this.confirmPayment(booking.id, signature, reference);
  }

  static async confirmPayment(
    bookingId: string,
    signature: string,
    reference: string
  ) {
    logger.info(
      `[BookingService] Starting payment confirmation for booking: ${bookingId}`
    );
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

      if (!booking) {
        logger.error(`[BookingService] Booking not found: ${bookingId}`);
        throw new Error("Booking not found");
      }
      if (booking.paymentStatus === PaymentStatus.COMPLETED) {
        logger.warn(
          `[BookingService] Booking ${bookingId} already marked as COMPLETED.`
        );
        return booking;
      }

      logger.info(
        `[BookingService] Verifying transaction signature: ${signature}`
      );
      const isValid = await getSolanaPay().verifyTransaction(
        signature,
        new PublicKey(reference),
        booking.totalPriceUsdc.toNumber()
      );

      logger.info(
        `[BookingService] Transaction verification for ${bookingId} returned: ${isValid}`
      );
      if (!isValid) {
        logger.error(
          `[BookingService] Invalid payment signature for booking: ${bookingId}`
        );
        throw new Error("Invalid payment signature");
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          transactionHash: signature,
          status: BookingStatus.CONFIRMED, // Move status update to here
        },
      });

      // Generate reward
      await RewardCalculationService.generateReward(bookingId);

      // Notify user
      await NotificationService.sendBookingConfirmation(
        booking.userId!,
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
          paymentStatus:
            booking.paymentStatus === PaymentStatus.COMPLETED
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
          const avg =
            ratings.reduce((sum, b) => sum + b.rating!, 0) / ratings.length;
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
