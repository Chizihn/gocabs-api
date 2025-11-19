import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";
import { Decimal } from "@prisma/client/runtime/library";
import { NotificationService } from "../notification/NotificationService";

const XP_TO_USDC_RATE = 0.01;

export class RewardCalculationService {
  private static readonly BASE_XP = 100;
  private static readonly CO2_PER_SEAT = 5;

  static async generateReward(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    const existing = await prisma.reward.findUnique({
      where: { bookingId },
    });

    if (existing) {
      return existing;
    }

    const xpEarned = this.BASE_XP * booking.seats;
    const co2SavedKg = Math.floor(this.CO2_PER_SEAT * booking.seats);

    const reward = await prisma.reward.create({
      data: {
        userId: booking.userId,
        bookingId,
        xpEarned,
        co2SavedKg,
        claimed: false,
      },
    });

    await NotificationService.sendRewardNotification(
      booking.userId,
      xpEarned,
      co2SavedKg
    );

    logger.info(
      `Reward created for booking ${bookingId}: ${xpEarned} XP, ${co2SavedKg}kg CO2`
    );

    return reward;
  }

  static async getUserTotalRewards(userId: string) {
    const totals = await prisma.reward.aggregate({
      where: { userId },
      _sum: {
        xpEarned: true,
        co2SavedKg: true,
        usdcValue: true,
      },
    });

    const redeemed = await prisma.reward.aggregate({
      where: { userId, claimed: true },
      _sum: {
        xpEarned: true,
        usdcValue: true,
      },
    });

    const totalXP = totals._sum.xpEarned || 0;
    const redeemedXP = redeemed._sum.xpEarned || 0;

    return {
      totalXP,
      totalCO2XP: totals._sum.co2SavedKg || 0,
      redeemedXP,
      redeemedAmount: Number(redeemed._sum.usdcValue || 0),
      availableXP: totalXP - redeemedXP,
    };
  }

  static async redeemRewards(userId: string, xpAmount: number) {
    if (xpAmount <= 0) {
      throw new Error("XP amount must be greater than zero");
    }

    return prisma.$transaction(async (tx) => {
      const summary = await this.getUserTotalRewards(userId); // Note: This still uses the main prisma client, but the check is before the transaction
      if (summary.availableXP < xpAmount) {
        throw new Error("Insufficient XP balance");
      }

      const rewards = await tx.reward.findMany({ // Use tx for findMany within transaction
        where: { userId, claimed: false },
        orderBy: { createdAt: "asc" },
      });

      let remaining = xpAmount;
      const updates: Promise<any>[] = [];

      for (const reward of rewards) {
        if (remaining <= 0) break;
        const redeeming = Math.min(remaining, reward.xpEarned);
        remaining -= redeeming;

        updates.push(
          tx.reward.update({ // Use tx for update within transaction
            where: { id: reward.id },
            data: {
              claimed: true,
              usdcValue: new Decimal(redeeming * XP_TO_USDC_RATE),
            },
          })
        );
      }

      await Promise.all(updates);

      logger.info(`User ${userId} redeemed ${xpAmount} XP`);

      return {
        xpRedeemed: xpAmount,
        usdcAmount: xpAmount * XP_TO_USDC_RATE,
        timestamp: new Date(),
      };
    });
  }
}
