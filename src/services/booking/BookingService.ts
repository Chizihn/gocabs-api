import { prisma } from "../../config/database";
import { SolanaPayService } from "../blockchain/SolanaPayService";
import { Decimal } from "@prisma/client/runtime/library";
import { Keypair } from "@solana/web3.js";
import { logger } from "../../utils/logger";
import { RewardCalculationService } from "../rewards/RewardCalculationService";
import { PublicKey } from "@solana/web3.js";

export class BookingService {
  static async createBooking({
    userId,
    shuttleId,
    seats,
  }: {
    userId: string;
    shuttleId: string;
    seats: number;
  }) {
    // 1. Fetch shuttle and user details
    const [shuttle, user] = await Promise.all([
      prisma.shuttle.findUnique({ where: { id: shuttleId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!shuttle) throw new Error("Shuttle not found.");
    if (!user) throw new Error("User not found.");

    // --- START: NEW CREDIT LOGIC ---

    // 2. Get user's available credit balance
    const userCredit = Number(user.creditBalanceUsdc);

    // 3. Calculate initial total price
    const basePrice = Number(shuttle.basePriceUsdc);
    const platformFee = 0; // Assuming no platform fee for now
    const initialTotalPrice = basePrice * seats + platformFee;

    // 4. Determine credit to apply and the final price
    const creditToApply = Math.min(initialTotalPrice, userCredit);
    const finalPriceToPay = initialTotalPrice - creditToApply;

    logger.info(
      `Booking calculation for user ${userId}: Total=${initialTotalPrice}, Credit=${userCredit}, Applying=${creditToApply}, Final=${finalPriceToPay}`
    );

    // --- END: NEW CREDIT LOGIC ---

    // 5. Create the booking and update credit balance within a transaction
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          userId,
          shuttleId,
          seats,
          totalPriceUsdc: new Decimal(initialTotalPrice),
          creditAppliedUsdc: new Decimal(creditToApply), // Store applied credit
          paymentStatus: finalPriceToPay > 0 ? "PENDING" : "COMPLETED",
          status: finalPriceToPay > 0 ? "PENDING_PAYMENT" : "CONFIRMED",
        },
      });

      // 6. Update the user's credit balance if credit was used
      if (creditToApply > 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            creditBalanceUsdc: {
              decrement: new Decimal(creditToApply),
            },
          },
        });
        logger.info(
          `User ${userId} spent ${creditToApply} credit. New balance: ${
            userCredit - creditToApply
          }`
        );
      }

      let payment = { url: "", reference: "" };

      // 7. Only generate a payment URL if there's a remaining balance
      if (finalPriceToPay > 0) {
        const solanaPayService = new SolanaPayService();
        const reference = new Keypair().publicKey;

        const paymentRequest = await solanaPayService.createPaymentRequest(
          finalPriceToPay, // Use the final price after discount
          reference,
          `GoCabs Ride: ${shuttle.id.substring(0, 4)}`,
          `Booking for ${seats} seat(s)`,
          booking.id
        );

        payment.url = paymentRequest.url;
        payment.reference = reference.toBase58();

        // Update booking with payment reference
        await tx.booking.update({
          where: { id: booking.id },
          data: { paymentReference: payment.reference },
        });
      } else {
        // Ride was fully paid with credit, trigger reward generation
        logger.info(
          `Booking ${booking.id} fully paid with credit. Generating reward.`
        );
        await RewardCalculationService.generateReward(booking.id);
      }

      return { booking, payment };
    });
  }

  /**
   * Confirms a payment after a successful Solana Pay transaction.
   * This is typically called by the frontend after being redirected from the wallet.
   */
  static async confirmPayment(
    bookingId: string,
    signature: string,
    reference: string
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new Error("Booking not found.");
    if (booking.paymentStatus === "COMPLETED") return booking; // Already confirmed

    const solanaPayService = new SolanaPayService();
    const isValid = await solanaPayService.verifyTransaction(
      signature,
      new PublicKey(reference),
      Number(booking.totalPriceUsdc) - Number(booking.creditAppliedUsdc || 0)
    );

    if (!isValid) {
      throw new Error("Transaction verification failed.");
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: "COMPLETED",
        status: "CONFIRMED",
        transactionHash: signature,
      },
    });

    // Generate reward for the completed ride
    await RewardCalculationService.generateReward(bookingId);

    return updatedBooking;
  }

  /**
   * Finds a booking by its payment reference and attempts to confirm the payment.
   * This is used for polling from the client side as a fallback.
   */
  static async findAndConfirmPaymentByReference(reference: string) {
    const booking = await prisma.booking.findUnique({
      where: { paymentReference: reference },
    });

    if (!booking) return null; // No booking found for this reference
    if (booking.paymentStatus === "COMPLETED") return booking; // Already confirmed

    const solanaPayService = new SolanaPayService();
    const signature = await solanaPayService.findTransactionSignature(
      new PublicKey(reference)
    );

    if (signature) {
      return this.confirmPayment(booking.id, signature, reference);
    }

    return null; // Signature not found yet
  }

  /**
   * Allows a user to cancel their own booking if it's eligible.
   */
  static async cancelBooking(bookingId: string, userId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
    });

    if (!booking) {
      throw new Error("Booking not found or you do not have permission.");
    }

    // Business rule: Allow cancellation only if the booking is pending or confirmed,
    // but not if it's already in progress or completed.
    if (
      booking.status !== "PENDING_PAYMENT" &&
      booking.status !== "CONFIRMED"
    ) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Refund any credit that was applied
      if (booking.creditAppliedUsdc && Number(booking.creditAppliedUsdc) > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { creditBalanceUsdc: { increment: booking.creditAppliedUsdc } },
        });
      }

      // 2. Update the booking status to CANCELLED
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
      });

      logger.info(`Booking ${bookingId} cancelled by user ${userId}.`);
      return true;
    });
  }
}
