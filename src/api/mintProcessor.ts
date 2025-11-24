import { prisma } from "../config/database";
import { executeMintAfterPayment } from "../services/blockchain/NFTMintService";
import { logger } from "../utils/logger";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 60 * 1000; // 1 minute

async function processMintQueue() {
  logger.info("[MintWorker] Checking for pending mint jobs...");

  const job = await prisma.mintAttempt.findFirst({
    where: {
      OR: [
        { status: "PENDING" },
        {
          status: "FAILED",
          retryCount: { lt: MAX_RETRIES },
          // Optional: Add a delay between retries
          // lastAttemptAt: { lt: new Date(Date.now() - RETRY_DELAY_MS) }
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!job) {
    logger.info("[MintWorker] No pending jobs found.");
    return;
  }

  logger.info(
    `[MintWorker] Processing job ${job.id} for signature ${job.paymentSignature}`
  );

  // Mark job as processing to prevent other workers from picking it up
  await prisma.mintAttempt.update({
    where: { id: job.id },
    data: { status: "PROCESSING", lastAttemptAt: new Date() },
  });

  try {
    const { success, mintAddress, user } = await executeMintAfterPayment(
      job.walletAddress,
      job.paymentSignature
    );

    if (success && user) {
      // On success, update the job and generate a new token for the user
      await prisma.mintAttempt.update({
        where: { id: job.id },
        data: { status: "COMPLETED", mintAddress },
      });

      // We can't send the token back directly, but the next time the user logs in,
      // their NFT will be found. The critical part is that the mint is completed.
      logger.info(
        `[MintWorker] Job ${job.id} completed successfully. Mint Address: ${mintAddress}`
      );
    } else {
      // This case should ideally not happen if executeMintAfterPayment throws on failure
      throw new Error(
        "Mint execution returned success:false without throwing an error."
      );
    }
  } catch (error: any) {
    logger.error(`[MintWorker] Job ${job.id} failed:`, error.message);

    await prisma.mintAttempt.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        retryCount: { increment: 1 },
        errorMessage: error.message,
      },
    });
  }
}

export function startMintWorker(interval: number = 30000) {
  // Run every 30 seconds
  logger.info(
    `[MintWorker] Starting mint processing worker with a ${interval}ms interval.`
  );
  setInterval(() => {
    processMintQueue().catch((err) => {
      logger.error("[MintWorker] Unhandled error in worker loop:", err);
    });
  }, interval);
}
