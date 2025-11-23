import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { NFTVerificationService } from "../blockchain/NFTVerificationService";
import { generateToken } from "../../middleware/auth";
import { logger } from "../../utils/logger";
import {
  LocationSettings,
  NotificationSettings,
} from "../../types/graphql/UserSettings";
import bcrypt from "bcrypt";

const tokenBlacklist = new Set<string>();

export class UserService {
  static async register(
    walletAddress: string,
    email?: string,
    username?: string,
    password?: string,
    role: UserRole = UserRole.SEEKER,
    companyName?: string,
    licenseNumber?: string
  ) {
    if (role === UserRole.OWNER && !companyName) {
      throw new Error("Company name is required for owners.");
    }
    if (role === UserRole.DRIVER && !licenseNumber) {
      throw new Error("License number is required for drivers.");
    }

    const normalized = walletAddress?.trim();
    const nftAccess = normalized
      ? await NFTVerificationService.hasNFTAccess(normalized)
      : { hasAccess: false };

    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : undefined;

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          walletAddress: normalized || null,
          email: email || null,
          username: username || null,
          password: hashedPassword || null,
          role,
        },
      });

      if (role === UserRole.OWNER) {
        await tx.owner.create({
          data: {
            userId: newUser.id,
            companyName: companyName || null,
          },
        });
      } else if (role === UserRole.DRIVER) {
        await tx.driver.create({
          data: {
            userId: newUser.id,
            licenseNumber: licenseNumber || null,
          },
        });
      }

      return newUser;
    });

    const token = generateToken(user.id, user.role, user.walletAddress || "");

    return { user, token, nftAccess };
  }

  static async connectWallet(walletAddress: string) {
    const normalized = walletAddress.trim();
    if (!normalized) {
      throw new Error("Wallet address is required");
    }

    // Invalidate cache to ensure a fresh check on every connection
    await NFTVerificationService.invalidateCache(normalized);

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

    const token = generateToken(user.id, user.role, normalized);

    return { user, token, nftAccess };
  }

  static async logout(token: string) {
    tokenBlacklist.add(token);
    return true;
  }

  static async uploadAvatar(userId: string, avatarUrl: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });
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

  static async updateProfile(userId: string, data: Prisma.UserUpdateInput) {
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

    const previous = (user.locationSettings as LocationSettings | null) ?? {
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
