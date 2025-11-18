import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { NFTVerificationService } from "../blockchain/NFTVerificationService";
import { generateToken } from "../../middleware/auth";
import { logger } from "../../utils/logger";
import {
  LocationSettings,
  NotificationSettings,
} from "../../types/graphql/UserSettings";

export class UserService {
  static async connectWallet(walletAddress: string) {
    const normalized = walletAddress.trim();
    if (!normalized) {
      throw new Error("Wallet address is required");
    }

    const nftAccess = await NFTVerificationService.hasNFTAccess(normalized);

    const user = await prisma.user.upsert({
      where: { walletAddress: normalized },
      update: {
        walletAddress: normalized,
      },
      create: {
        walletAddress: normalized,
        role: UserRole.SEEKER,
      },
    });

    const token = generateToken(user.id, normalized);

    return { user, token, nftAccess };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: true,
        owner: true,
        bookings: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        rewards: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        stakedNFTs: {
          where: { isActive: true },
          orderBy: { stakedAt: "desc" },
        },
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!user) throw new Error("User not found");
    return user;
  }

  static async updateProfile(
    userId: string,
    data: Prisma.UserUpdateInput
  ) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  static async updateNotificationSettings(
    userId: string,
    input: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const previous =
      (user.notificationSettings as NotificationSettings | null) ?? {
        rideUpdates: true,
        promotions: true,
        rewards: true,
        staking: true,
      };

    const next = {
      ...previous,
      ...input,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        notificationSettings: next,
      },
    });

    logger.info(`Notification settings updated for user ${userId}`);
    return next;
  }

  static async getNotificationSettings(
    userId: string
  ): Promise<NotificationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return (
      (user.notificationSettings as NotificationSettings | null) ?? {
        rideUpdates: true,
        promotions: true,
        rewards: true,
        staking: true,
      }
    );
  }

  static async updateLocationSettings(
    userId: string,
    input: Partial<LocationSettings>
  ): Promise<LocationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locationSettings: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const previous =
      (user.locationSettings as LocationSettings | null) ?? {
        shareLocation: true,
        accuracy: "high",
        backgroundUpdates: false,
      };

    const next = {
      ...previous,
      ...input,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        locationSettings: next,
      },
    });

    logger.info(`Location settings updated for user ${userId}`);
    return next;
  }

  static async getLocationSettings(userId: string): Promise<LocationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locationSettings: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return (
      (user.locationSettings as LocationSettings | null) ?? {
        shareLocation: true,
        accuracy: "high",
        backgroundUpdates: false,
      }
    );
  }
}

