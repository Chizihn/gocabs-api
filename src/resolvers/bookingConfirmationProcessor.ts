import { prisma } from "../config/database";
import { SolanaPayService } from "../services/blockchain/SolanaPayService";
import { logger } from "../utils/logger";
import { PublicKey } from "@solana/web3.js";

const MAX_RETRIES = 5;
const solanaPayService = new SolanaPayService();

async function processBookingConfirmationQueue() {
  logger.info("[BookingWorker] Checking for pending booking confirmations...");

  const booking = await prisma.booking.findFirst({
    where: {
      transactionHash: { not: null }, // Has been paid
      confirmationStatus: { not: "CONFIRMED" }, // Not yet confirmed
      confirmationRetries: { lt: MAX_RETRIES },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!booking || !booking.transactionHash || !booking.paymentReference) {
    logger.info("[BookingWorker] No pending booking confirmations found.");
    return;
  }

  logger.info(
    `[BookingWorker] Processing booking ${booking.id} with signature ${booking.transactionHash}`
  );

  await prisma.booking.update({
    where: { id: booking.id },
    data: { confirmationRetries: { increment: 1 } },
  });

  try {
    const isVerified = await solanaPayService.verifyTransaction(
      booking.transactionHash,
      new PublicKey(booking.paymentReference),
      booking.totalPriceUsdc.toNumber()
    );

    if (isVerified) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: "COMPLETED",
          confirmationStatus: "CONFIRMED",
        },
      });
      logger.info(
        `[BookingWorker] Successfully confirmed booking ${booking.id}`
      );
      // Here you would trigger a notification to the user
    } else {
      // This could happen if the transaction is not yet finalized on-chain.
      // The worker will retry.
      throw new Error("Transaction verification returned false.");
    }
  } catch (error: any) {
    logger.error(
      `[BookingWorker] Failed to confirm booking ${booking.id}:`,
      error.message
    );
    await prisma.booking.update({
      where: { id: booking.id },
      data: { confirmationStatus: "FAILED", confirmationError: error.message },
    });
  }
}

export function startBookingConfirmationWorker(interval: number = 60000) {
  // Run every 60 seconds
  logger.info(
    `[BookingWorker] Starting booking confirmation worker with a ${interval}ms interval.`
  );
  setInterval(() => {
    processBookingConfirmationQueue().catch((err) => {
      logger.error("[BookingWorker] Unhandled error in worker loop:", err);
    });
  }, interval);
}
