import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";
import { Decimal } from "@prisma/client/runtime/library";

export class RewardCalculationService {
  // Base XP per ride
  private static BASE_XP = 100;
  // CO2 saved per ride (in kg)
  private static CO2_PER_RIDE = 5;
  // CO2 XP multiplier
  private static CO2_XP_MULTIPLIER = 10;

  static async generateReward(bookingId: string) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { user: true, shuttle: true },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      // Check if reward already exists
      const existingReward = await prisma.reward.findUnique({
        where: { bookingId },
      });

      if (existingReward) {
        logger.warn(`Reward already exists for booking ${bookingId}`);
        return existingReward;
      }

      // Calculate XP (base + number of seats)
      const xpPoints = this.BASE_XP * booking.numberOfSeats;

      // Calculate CO2 XP
      const co2XpPoints = Math.floor(
        this.CO2_PER_RIDE * booking.numberOfSeats * this.CO2_XP_MULTIPLIER
      );

      // Create reward
      const reward = await prisma.reward.create({
        data: {
          userId: booking.userId,
          bookingId,
          xpPoints,
          co2XpPoints,
          isRedeemed: false,
        },
      });

      logger.info(
        `Reward created for booking ${bookingId}: ${xpPoints} XP, ${co2XpPoints} CO2 XP`
      );
      return reward;
    } catch (error) {
      logger.error("Reward generation failed:", error);
      throw error;
    }
  }

  static async getUserTotalRewards(userId: string) {
    const rewards = await prisma.reward.aggregate({
      where: { userId },
      _sum: {
        xpPoints: true,
        co2XpPoints: true,
      },
    });

    const redeemedRewards = await prisma.reward.aggregate({
      where: { userId, isRedeemed: true },
      _sum: {
        xpPoints: true,
        redeemedAmount: true,
      },
    });

    return {
      totalXP: rewards._sum.xpPoints || 0,
      totalCO2XP: rewards._sum.co2XpPoints || 0,
      redeemedXP: redeemedRewards._sum.xpPoints || 0,
      redeemedAmount: Number(redeemedRewards._sum.redeemedAmount || 0),
      availableXP:
        (rewards._sum.xpPoints || 0) - (redeemedRewards._sum.xpPoints || 0),
    };
  }

  static async redeemRewards(userId: string, xpAmount: number) {
    try {
      // Get user's unredeemed rewards
      const unredeemedRewards = await prisma.reward.findMany({
        where: { userId, isRedeemed: false },
        orderBy: { createdAt: "asc" },
      });

      const totalAvailableXP = unredeemedRewards.reduce(
        (sum: number, r: { xpPoints: number }) => sum + r.xpPoints,
        0
      );

      if (totalAvailableXP < xpAmount) {
        throw new Error("Insufficient XP balance");
      }

      // XP to USDC conversion rate (e.g., 100 XP = 1 USDC)
      const XP_TO_USDC_RATE = 0.01;
      const usdcAmount = xpAmount * XP_TO_USDC_RATE;

      // Mark rewards as redeemed
      let remainingXP = xpAmount;
      const redeemPromises = [];

      for (const reward of unredeemedRewards) {
        if (remainingXP <= 0) break;

        const xpToRedeem = Math.min(remainingXP, reward.xpPoints);
        remainingXP -= xpToRedeem;

        const redeemedAmount = new Decimal(xpToRedeem * XP_TO_USDC_RATE);
        redeemPromises.push(
          prisma.reward.update({
            where: { id: reward.id },
            data: {
              isRedeemed: true,
              redeemedAmount,
              redeemedAt: new Date(),
            },
          })
        );
      }

      await Promise.all(redeemPromises);

      logger.info(
        `User ${userId} redeemed ${xpAmount} XP for ${usdcAmount} USDC`
      );

      return {
        xpRedeemed: xpAmount,
        usdcAmount,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error("Reward redemption failed:", error);
      throw error;
    }
  }
}
