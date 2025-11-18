import { StakeType, StakingTier } from "@prisma/client";
import { prisma } from "../../config/database";
import { NFTVerificationService } from "./NFTVerificationService";
import { logger } from "../../utils/logger";

type RevenuePeriod = "monthly" | "weekly";

export class StakingService {
  private static getPeriodRange(period: RevenuePeriod) {
    const endDate = new Date();
    const startDate = new Date();

    if (period === "monthly") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate.setDate(startDate.getDate() - 7);
    }

    return { startDate, endDate };
  }

  static async stakeNFT(
    userId: string,
    tokenMint: string,
    stakeType: StakeType,
    tier: StakingTier,
    shuttleId?: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      throw new Error("Wallet address is required to stake");
    }

    const ownsNFT = await NFTVerificationService.verifySpecificNFT(
      user.walletAddress,
      tokenMint
    );

    if (!ownsNFT) {
      throw new Error("Wallet does not own this NFT");
    }

    const existing = await prisma.stakedNFT.findUnique({
      where: { tokenMint },
    });

    if (existing?.isActive) {
      throw new Error("NFT is already staked");
    }

    if (stakeType === StakeType.FRACTIONAL) {
      if (!shuttleId) {
        throw new Error("Fractional staking requires a shuttle");
      }

      const shuttle = await prisma.shuttle.findUnique({
        where: { id: shuttleId },
        select: { isFractionalized: true },
      });

      if (!shuttle?.isFractionalized) {
        throw new Error("Shuttle does not support fractional ownership");
      }
    }

    const stake = await prisma.stakedNFT.create({
      data: {
        walletAddress: user.walletAddress,
        tokenMint,
        stakeType,
        tier,
        shuttleId: shuttleId ?? null,
        isActive: true,
      },
    });

    await NFTVerificationService.invalidateCache(user.walletAddress);
    logger.info(`NFT ${tokenMint} staked by ${user.walletAddress}`);

    return stake;
  }

  static async unstakeNFT(userId: string, tokenMint: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      throw new Error("Wallet address missing");
    }

    const stake = await prisma.stakedNFT.findUnique({
      where: { tokenMint },
    });

    if (!stake || stake.walletAddress !== user.walletAddress) {
      throw new Error("Stake not found");
    }

    if (!stake.isActive) {
      throw new Error("NFT already unstaked");
    }

    await prisma.stakedNFT.update({
      where: { tokenMint },
      data: {
        isActive: false,
        unstakedAt: new Date(),
      },
    });

    await NFTVerificationService.invalidateCache(user.walletAddress);
    return true;
  }

  static async getUserStakedNFTs(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      throw new Error("Wallet not connected");
    }

    return prisma.stakedNFT.findMany({
      where: { walletAddress: user.walletAddress, isActive: true },
      include: {
        shuttle: {
          include: { event: true },
        },
        payouts: {
          orderBy: { payoutDate: "desc" },
          take: 10,
        },
      },
    });
  }

  static async calculateRevenueShare(period: RevenuePeriod = "monthly") {
    const { startDate, endDate } = this.getPeriodRange(period);

    const stakes = await prisma.stakedNFT.findMany({
      where: { isActive: true, stakeType: StakeType.POOL },
    });

    const revenue = await prisma.booking.aggregate({
      where: {
        paymentStatus: "COMPLETED",
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { totalPriceUsdc: true },
    });

    const totalRevenue = Number(revenue._sum.totalPriceUsdc || 0);
    const distributableRevenue = totalRevenue * 0.65;

    const tier1 = stakes.filter((s) => s.tier === StakingTier.TIER_1);
    const tier2 = stakes.filter((s) => s.tier === StakingTier.TIER_2);

    return {
      totalRevenue,
      distributableRevenue,
      tier1PerNFT: tier1.length ? (distributableRevenue * 0.25) / tier1.length : 0,
      tier2PerNFT: tier2.length ? (distributableRevenue * 0.4) / tier2.length : 0,
      tier1Stakes: tier1.length,
      tier2Stakes: tier2.length,
      period,
      startDate,
      endDate,
    };
  }

  static async calculateFractionalOwnershipRevenue(
    shuttleId: string,
    period: RevenuePeriod = "monthly"
  ) {
    const { startDate, endDate } = this.getPeriodRange(period);

    const stakes = await prisma.stakedNFT.findMany({
      where: { shuttleId, isActive: true },
    });

    if (!stakes.length) {
      return {
        totalRevenue: 0,
        perNFT: 0,
        stakes: 0,
        period,
        startDate,
        endDate,
      };
    }

    const revenue = await prisma.booking.aggregate({
      where: {
        shuttleId,
        paymentStatus: "COMPLETED",
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { totalPriceUsdc: true },
    });

    const totalRevenue = Number(revenue._sum.totalPriceUsdc || 0);

    return {
      totalRevenue,
      perNFT: totalRevenue / stakes.length,
      stakes: stakes.length,
      period,
      startDate,
      endDate,
    };
  }
}
