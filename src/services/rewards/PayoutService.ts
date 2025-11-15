import { prisma } from "../../config/database";
import { PaymentStatus, PayoutStatus, PayoutType } from "@prisma/client";
import { logger } from "../../utils/logger";
import { SolanaPayService } from "../blockchain/SolanaPayService";
import { PublicKey } from "@solana/web3.js";

export class PayoutService {
  private solanaPayService: SolanaPayService;

  constructor() {
    this.solanaPayService = new SolanaPayService();
  }

  async processMonthlyPayouts() {
    logger.info("Starting monthly payout process...");

    try {
      // Get all active stakes
      const activeStakes = await prisma.stakedNFT.findMany({
        where: { isActive: true },
        include: {
          user: true,
          shuttle: true,
        },
      });

      // Calculate revenue share
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      const totalRevenue = await prisma.booking.aggregate({
        where: {
          paymentStatus: PaymentStatus.COMPLETED,
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { totalPrice: true },
      });

      const revenueAmount = Number(totalRevenue._sum.totalPrice || 0);
      const platformFee = revenueAmount * 0.1;
      const distributableRevenue = revenueAmount - platformFee;

      // Separate pool and fractional stakes
      const poolStakes = activeStakes.filter((s: { shuttleId: string | null }) => !s.shuttleId);
      const fractionalStakes = activeStakes.filter((s: { shuttleId: string | null }) => !!s.shuttleId);

      // Process pool payouts
      await this.processPoolPayouts(poolStakes, distributableRevenue);

      // Process fractional payouts
      await this.processFractionalPayouts(fractionalStakes, startDate, endDate);

      logger.info("Monthly payout process completed");
    } catch (error) {
      logger.error("Payout process failed:", error);
      throw error;
    }
  }

  private async processPoolPayouts(
    stakes: any[],
    distributableRevenue: number
  ) {
    const tier1Stakes = stakes.filter((s) => s.stakingTier === "TIER_1");
    const tier2Stakes = stakes.filter((s) => s.stakingTier === "TIER_2");

    const tier1Pool = distributableRevenue * 0.25;
    const tier2Pool = distributableRevenue * 0.4;

    const tier1PerNFT =
      tier1Stakes.length > 0 ? tier1Pool / tier1Stakes.length : 0;
    const tier2PerNFT =
      tier2Stakes.length > 0 ? tier2Pool / tier2Stakes.length : 0;

    // Create payout records
    const payoutPromises = [];

    for (const stake of tier1Stakes) {
      payoutPromises.push(
        this.createPayout(
          stake.id,
          tier1PerNFT,
          PayoutType.REVENUE_SHARE,
          stake.user.walletAddress
        )
      );
    }

    for (const stake of tier2Stakes) {
      payoutPromises.push(
        this.createPayout(
          stake.id,
          tier2PerNFT,
          PayoutType.REVENUE_SHARE,
          stake.user.walletAddress
        )
      );
    }

    await Promise.all(payoutPromises);
  }

  private async processFractionalPayouts(
    stakes: any[],
    startDate: Date,
    endDate: Date
  ) {
    // Group by shuttle
    const stakesByShuttle = stakes.reduce((acc: any, stake: any) => {
      if (!acc[stake.shuttleId]) {
        acc[stake.shuttleId] = [];
      }
      acc[stake.shuttleId].push(stake);
      return acc;
    }, {});

    for (const [shuttleId, shuttleStakes] of Object.entries(stakesByShuttle)) {
      // Get shuttle revenue
      const shuttleRevenue = await prisma.booking.aggregate({
        where: {
          shuttleId: shuttleId as string,
          paymentStatus: PaymentStatus.COMPLETED,
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { totalPrice: true },
      });

      const revenue = Number(shuttleRevenue._sum.totalPrice || 0);
      const perNFT = revenue / (shuttleStakes as any[]).length;

      // Create payouts
      for (const stake of shuttleStakes as any[]) {
        await this.createPayout(
          stake.id,
          perNFT,
          "FRACTIONAL_OWNERSHIP",
          stake.user.walletAddress
        );
      }
    }
  }

  private async createPayout(
    stakedNFTId: string,
    amount: number,
    type: "REVENUE_SHARE" | "FRACTIONAL_OWNERSHIP",
    walletAddress?: string
  ) {
    if (amount <= 0) return;

    const payout = await prisma.payout.create({
      data: {
        stakedNFTId,
        amount,
        payoutType: type,
        status: PayoutStatus.PENDING,
      },
    });

    // Update total earnings
    await prisma.stakedNFT.update({
      where: { id: stakedNFTId },
      data: {
        totalEarnings: { increment: amount },
        lastPayoutAt: new Date(),
      },
    });

    // If wallet address exists, process USDC transfer
    if (walletAddress) {
      try {
        await this.processUSDCTransfer(payout.id, walletAddress, amount);
      } catch (error) {
        logger.error(
          `Failed to process USDC transfer for payout ${payout.id}:`,
          error
        );
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.FAILED },
        });
      }
    }

    logger.info(`Payout created: ${payout.id} - ${amount} USDC (${type})`);
  }

private async processUSDCTransfer(
  payoutId: string,
  walletAddress: string,
  amount: number
) {
  try {
    // Mark as processing
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.PROCESSING },
    });

    const toWallet = new PublicKey(walletAddress);
    const merchantWallet = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS!);

    // Create and send transaction
    const transaction = await this.solanaPayService.createUSDCTransfer(
      merchantWallet,
      toWallet,
      amount
    );

    // Sign and send the transaction
    const signature = await this.solanaPayService.signAndSendTransaction(transaction);

    // Wait for confirmation
    const isConfirmed = await this.solanaPayService.confirmTransaction(signature);
    
    if (!isConfirmed) {
      throw new Error('Transaction confirmation failed');
    }

    // Get transaction details for logging
    const txDetails = await this.solanaPayService.getTransactionDetails(signature);
    logger.info('Transaction details:', JSON.stringify(txDetails, null, 2));

    // Update with success
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'COMPLETED',
        transactionHash: signature,
        payoutDate: new Date(),
      },
    });

    logger.info(`Successfully processed USDC transfer for payout ${payoutId}`);
    return true;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`USDC transfer failed for payout ${payoutId}:`, error);
    
    // Update with failure - we'll log the error since there's no error field in the schema
    logger.error(`Payout failed: ${errorMessage}`);
    await prisma.payout.update({
      where: { id: payoutId },
      data: { 
        status: 'FAILED',
        payoutDate: new Date(),
      },
    });
    
    // Re-throw with proper error type
    throw error instanceof Error ? error : new Error(errorMessage);
  }
}
}
