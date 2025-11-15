import { Resolver, Query, Mutation, Arg, Ctx, Authorized, UseMiddleware, registerEnumType } from "type-graphql";
import { User, AuthResponse } from "../types/graphql/User";
import {
  NotificationSettings,
  LocationSettings,
  UpdateNotificationSettingsInput,
  UpdateLocationSettingsInput,
} from "../types/graphql/UserSettings";
import { prisma } from "../config/database";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { generateToken } from "../middleware/auth";
import { logger } from "../utils/logger";
import { Context } from "../types/Context";
import { authRateLimiter } from "../middleware/graphqlRateLimits";
import { PaymentStatus, PayoutStatus, PayoutType, UserRole } from "@prisma/client";

  registerEnumType(UserRole, {
    name: "UserRole",
    description: "User role types in the system",
    valuesConfig: {
      SEEKER: { description: "Regular user looking for rides" },
      DRIVER: { description: "Driver who operates shuttles" },
      OWNER: { description: "Fleet owner who manages vehicles and drivers" },
      ADMIN: { description: "System administrator" },
    },
  });

  
  // PaymentStatus enum
  registerEnumType(PaymentStatus, {
    name: "PaymentStatus",
    description: "Status of a payment transaction",
    valuesConfig: {
      PENDING: { description: "Payment is pending processing" },
      PROCESSING: { description: "Payment is being processed" },
      COMPLETED: { description: "Payment has been successfully completed" },
      FAILED: { description: "Payment processing failed" },
      REFUNDED: { description: "Payment has been refunded" },
    },
  });


  // PayoutType enum
  registerEnumType(PayoutType, {
    name: "PayoutType",
    description: "Type of payout",
    valuesConfig: {
      REVENUE_SHARE: { description: "Revenue share from shuttle operations" },
      FRACTIONAL_OWNERSHIP: { description: "Earnings from fractional ownership" },
    },
  });

  // PayoutStatus enum
  registerEnumType(PayoutStatus, {
    name: "PayoutStatus",
    description: "Status of a payout",
    valuesConfig: {
      PENDING: { description: "Payout is pending processing" },
      PROCESSING: { description: "Payout is being processed" },
      COMPLETED: { description: "Payout has been completed" },
    },
  });


@Resolver()
export class UserResolver {
  @UseMiddleware(authRateLimiter)
  @Mutation(() => AuthResponse)
  async connectWallet(
    @Arg("walletAddress") walletAddress: string
  ): Promise<AuthResponse> {
    try {
      // Verify NFT ownership
      const { isHolder, nftTokens } =
        await NFTVerificationService.verifyNFTOwnership(walletAddress);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { walletAddress },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            walletAddress,
            isNFTHolder: isHolder,
            nftTokens,
          },
        });
        logger.info(`New user created: ${walletAddress}`);
      } else {
        // Update NFT holder status
        user = await prisma.user.update({
          where: { walletAddress },
          data: {
            isNFTHolder: isHolder,
            nftTokens,
          },
        });
      }

      const token = generateToken(user.id, user?.walletAddress as string);

      return {
        token,
        user,
        isNFTHolder: isHolder,
      };
    } catch (error) {
      logger.error("Wallet connection failed:", error);
      throw new Error("Failed to connect wallet");
    }
  }

  @Authorized()
  @Query(() => User)
  async me(@Ctx() ctx: Context): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
    });

    if (!user) throw new Error("User not found");
    return user;
  }

  @Authorized()
  @Mutation(() => Boolean)
  async refreshNFTStatus(@Ctx() ctx: Context): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
    });

    if (!user) throw new Error("User not found");
    if (!user.walletAddress) throw new Error("No wallet address found for user");

    // Invalidate cache and re-verify
    await NFTVerificationService.invalidateCache(user.walletAddress);
    const { isHolder, nftTokens } =
      await NFTVerificationService.verifyNFTOwnership(user.walletAddress);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        isNFTHolder: isHolder, 
        nftTokens: nftTokens || [] 
      },
    });

    return isHolder;
  }

  @Authorized()
  @Mutation(() => Boolean)
  async updateFCMToken(
    @Arg("fcmToken") fcmToken: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.user.update({
      where: { id: ctx.userId! },
      data: { fcmToken },
    });
    logger.info(`FCM token updated for user ${ctx.userId}`);
    return true;
  }

  @Authorized()
  @Query(() => NotificationSettings)
  async getNotificationSettings(@Ctx() ctx: Context): Promise<NotificationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      select: { notificationSettings: true },
    });

    if (!user) throw new Error("User not found");

    const settings = (user.notificationSettings as any) || {
      rideUpdates: true,
      promotions: true,
      rewards: true,
    };

    return settings;
  }

  @Authorized()
  @Mutation(() => NotificationSettings)
  async updateNotificationSettings(
    @Arg("input") input: UpdateNotificationSettingsInput,
    @Ctx() ctx: Context
  ): Promise<NotificationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      select: { notificationSettings: true },
    });

    if (!user) throw new Error("User not found");

    const currentSettings = (user.notificationSettings as any) || {
      rideUpdates: true,
      promotions: true,
      rewards: true,
    };

    const updatedSettings = {
      ...currentSettings,
      ...input,
    };

    await prisma.user.update({
      where: { id: ctx.userId! },
      data: { notificationSettings: updatedSettings as any },
    });

    return updatedSettings;
  }

  @Authorized()
  @Query(() => LocationSettings)
  async getLocationSettings(@Ctx() ctx: Context): Promise<LocationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      select: { locationSettings: true },
    });

    if (!user) throw new Error("User not found");

    const settings = (user.locationSettings as any) || {
      shareLocation: true,
      locationAccuracy: "high",
    };

    return settings;
  }

  @Authorized()
  @Mutation(() => LocationSettings)
  async updateLocationSettings(
    @Arg("input") input: UpdateLocationSettingsInput,
    @Ctx() ctx: Context
  ): Promise<LocationSettings> {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId! },
      select: { locationSettings: true },
    });

    if (!user) throw new Error("User not found");

    const currentSettings = (user.locationSettings as any) || {
      shareLocation: true,
      locationAccuracy: "high",
    };

    const updatedSettings = {
      ...currentSettings,
      ...input,
    };

    await prisma.user.update({
      where: { id: ctx.userId! },
      data: { locationSettings: updatedSettings as any },
    });

    return updatedSettings;
  }
}
