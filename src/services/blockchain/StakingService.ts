import { prisma } from "../../config/database";
import { NFTVerificationService } from "./NFTVerificationService";
import { logger } from "../../utils/logger";
import { StakedNFT } from "../../types/graphql/Staking";
import { StakingTier } from "@prisma/client";

export class StakingService {
  static async stakeNFT(
    userId: string,
    nftMintAddress: string,
    shuttleId?: string
  ) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("User not found");

      // Verify NFT ownership
      const isOwner = await NFTVerificationService.verifySpecificNFT(
        user.walletAddress as string,
        nftMintAddress
      );

      if (!isOwner) {
        throw new Error("You do not own this NFT");
      }

      // Check if already staked
      const existing = await prisma.stakedNFT.findFirst({
        where: { nftMintAddress, isActive: true },
      });

      if (existing) {
        throw new Error("NFT is already staked");
      }

      // If shuttleId provided, verify shuttle exists and is fractionalized
      if (shuttleId) {
        const shuttle = await prisma.shuttle.findUnique({
          where: { id: shuttleId },
        });

        if (!shuttle) {
          throw new Error("Shuttle not found");
        }

        if (!shuttle.isFractionalized) {
          throw new Error("Shuttle is not available for fractional ownership");
        }
      }

      // Determine staking tier based on user's total staked NFTs
      const userStakedCount = await prisma.stakedNFT.count({
        where: { userId, isActive: true },
      });

      const tier =
        userStakedCount >= 2 ? StakingTier.TIER_2 : StakingTier.TIER_1;

      // Create staking record
      const stakedNFT = await prisma.stakedNFT.create({
        data: {
          userId,
          nftMintAddress,
          stakingTier: tier,
          shuttleId: shuttleId || null,
          stakedAt: new Date(),
          isActive: true,
        },
      });

      logger.info(
        `NFT staked: ${nftMintAddress} by user ${userId} (Tier: ${tier})`
      );
      return stakedNFT;
    } catch (error) {
      logger.error("Staking failed:", error);
      throw error;
    }
  }

  static async unstakeNFT(userId: string, stakedNFTId: string) {
    try {
      const stakedNFT = await prisma.stakedNFT.findUnique({
        where: { id: stakedNFTId },
      });

      if (!stakedNFT || stakedNFT.userId !== userId) {
        throw new Error("Staked NFT not found");
      }

      if (!stakedNFT.isActive) {
        throw new Error("NFT is not currently staked");
      }

      // Update staking record
      await prisma.stakedNFT.update({
        where: { id: stakedNFTId },
        data: {
          isActive: false,
          unstakedAt: new Date(),
        },
      });

      logger.info(`NFT unstaked: ${stakedNFT.nftMintAddress}`);
      return true;
    } catch (error) {
      logger.error("Unstaking failed:", error);
      throw error;
    }
  }

  static async getUserStakedNFTs(userId: string) {
    return prisma.stakedNFT.findMany({
      where: { userId, isActive: true },
      include: {
        shuttle: {
          select: {
            id: true,
            vehicleNumber: true,
            event: { select: { name: true } },
          },
        },
        payouts: {
          orderBy: { payoutDate: "desc" },
          take: 10,
        },
      },
    });
  }

  static async calculateRevenueShare(period: "monthly" | "weekly" = "monthly") {
    try {
      // Get all active stakes (pool staking only, not fractionalized)
      const stakes = await prisma.stakedNFT.findMany({
        where: { isActive: true, shuttleId: null },
        include: { user: true },
      });

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      if (period === "monthly") {
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate.setDate(startDate.getDate() - 7);
      }

      // Get total revenue
      const totalRevenue = await prisma.booking.aggregate({
        where: {
          paymentStatus: "COMPLETED",
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { totalPrice: true },
      });

      const revenueAmount = Number(totalRevenue._sum.totalPrice || 0);
      const platformFee = revenueAmount * 0.1; // 10% platform fee
      const distributableRevenue = revenueAmount - platformFee;

      // Separate by tier with proper type assertion
      const tier1Stakes = stakes.filter(
        (s) => s.stakingTier === StakingTier.TIER_1
      ) as unknown as StakedNFT[];
      const tier2Stakes = stakes.filter(
        (s) => s.stakingTier === StakingTier.TIER_2
      ) as unknown as StakedNFT[];

      const tier1Pool = distributableRevenue * 0.25; // 25% for Tier 1
      const tier2Pool = distributableRevenue * 0.4; // 40% for Tier 2

      const tier1PerNFT =
        tier1Stakes.length > 0 ? tier1Pool / tier1Stakes.length : 0;
      const tier2PerNFT =
        tier2Stakes.length > 0 ? tier2Pool / tier2Stakes.length : 0;

      logger.info(
        `Revenue share calculated: Total=${revenueAmount}, Tier1=${tier1PerNFT}, Tier2=${tier2PerNFT}`
      );

      return {
        totalRevenue: revenueAmount,
        platformFee,
        distributableRevenue,
        tier1PerNFT,
        tier2PerNFT,
        tier1Stakes: tier1Stakes.length,
        tier2Stakes: tier2Stakes.length,
        period,
        startDate,
        endDate,
      };
    } catch (error) {
      logger.error("Revenue share calculation failed:", error);
      throw error;
    }
  }

  static async calculateFractionalOwnershipRevenue(
    shuttleId: string,
    period: "monthly" | "weekly" = "monthly"
  ) {
    try {
      // Get stakes for this shuttle
      const stakes = await prisma.stakedNFT.findMany({
        where: { shuttleId, isActive: true },
      });

      if (stakes.length === 0) {
        return { totalRevenue: 0, perNFT: 0, stakes: 0 };
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      if (period === "monthly") {
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate.setDate(startDate.getDate() - 7);
      }

      // Get shuttle revenue
      const shuttleRevenue = await prisma.booking.aggregate({
        where: {
          shuttleId,
          paymentStatus: "COMPLETED",
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { totalPrice: true },
      });

      const revenueAmount = Number(shuttleRevenue._sum.totalPrice || 0);
      const perNFT = revenueAmount / stakes.length;

      logger.info(
        `Fractional revenue for shuttle ${shuttleId}: ${revenueAmount} (${perNFT} per NFT)`
      );

      return {
        totalRevenue: revenueAmount,
        perNFT,
        stakes: stakes.length,
        period,
        startDate,
        endDate,
      };
    } catch (error) {
      logger.error("Fractional ownership revenue calculation failed:", error);
      throw error;
    }
  }
}
