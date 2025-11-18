import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import {
  User,
  AuthResponse,
  UpdateUserProfileInput,
} from "../types/graphql/User";
import {
  NotificationSettings,
  LocationSettings,
  UpdateNotificationSettingsInput,
  UpdateLocationSettingsInput,
} from "../types/graphql/UserSettings";
import { type Context } from "../types/Context";
import { NFTVerificationResponse } from "../types/graphql/NFT";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { UserService } from "../services/user/UserService";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { User as PrismaUser, Prisma } from "@prisma/client";

// Helper to transform Prisma User to GraphQL User
const toGqlUser = (user: PrismaUser & { [key: string]: any }): User => {
  return {
    ...user,
    notificationSettings: (typeof user.notificationSettings === "string"
      ? JSON.parse(user.notificationSettings)
      : user.notificationSettings) as NotificationSettings,
    locationSettings: (typeof user.locationSettings === "string"
      ? JSON.parse(user.locationSettings)
      : user.locationSettings) as LocationSettings,
  };
};

@Resolver(() => User)
export class UserResolver {
  @Mutation(() => AuthResponse)
  async connectWallet(
    @Arg("walletAddress") walletAddress: string
  ): Promise<AuthResponse> {
    const { user, token, nftAccess } = await UserService.connectWallet(
      walletAddress
    );

    return {
      token,
      user: toGqlUser(user),
      hasNFTAccess: nftAccess.hasAccess,
    };
  }

  @Authorized()
  @Query(() => User)
  async me(@Ctx() ctx: Context): Promise<User> {
    const user = await UserService.getMe(ctx.userId!);
    return toGqlUser(user);
  }

  @Authorized()
  @Mutation(() => User)
  async updateProfile(
    @Ctx() ctx: Context,
    @Arg("input") input: UpdateUserProfileInput
  ): Promise<User> {
    // Check if email is being updated and validate uniqueness
    if (input.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: input.email,
          id: { not: ctx.userId! },
        },
      });

      if (existingUser) {
        throw new Error("Email is already in use");
      }
    }

    // Check if username is being updated and validate uniqueness
    if (input.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: input.username,
          id: { not: ctx.userId! },
        },
      });

      if (existingUser) {
        throw new Error("Username is already taken");
      }
    }

    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (input.email) dataToUpdate.email = input.email;
    if (input.username) dataToUpdate.username = input.username;
    if (input.phoneNumber) dataToUpdate.phoneNumber = input.phoneNumber;

    const updated = await UserService.updateProfile(ctx.userId!, dataToUpdate);

    return toGqlUser(updated);
  }

  @Authorized()
  @Mutation(() => Boolean)
  async updateFCMToken(
    @Ctx() ctx: Context,
    @Arg("fcmToken") fcmToken: string
  ): Promise<boolean> {
    try {
      await prisma.user.update({
        where: { id: ctx.userId! },
        data: { fcmToken },
      });
      logger.info(`FCM token updated for user ${ctx.userId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update FCM token for user ${ctx.userId}:`, error);
      throw new Error("Failed to update FCM token");
    }
  }

  @Authorized()
  @Query(() => NotificationSettings)
  async getNotificationSettings(
    @Ctx() ctx: Context
  ): Promise<NotificationSettings> {
    try {
      return await UserService.getNotificationSettings(ctx.userId!);
    } catch (error) {
      logger.error(
        `Failed to get notification settings for user ${ctx.userId}:`,
        error
      );
      throw new Error("Failed to retrieve notification settings");
    }
  }

  @Authorized()
  @Mutation(() => NotificationSettings)
  async updateNotificationSettings(
    @Ctx() ctx: Context,
    @Arg("input") input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings> {
    try {
      return await UserService.updateNotificationSettings(ctx.userId!, input);
    } catch (error) {
      logger.error(
        `Failed to update notification settings for user ${ctx.userId}:`,
        error
      );
      throw new Error("Failed to update notification settings");
    }
  }

  @Authorized()
  @Query(() => LocationSettings)
  async getLocationSettings(@Ctx() ctx: Context): Promise<LocationSettings> {
    try {
      return await UserService.getLocationSettings(ctx.userId!);
    } catch (error) {
      logger.error(
        `Failed to get location settings for user ${ctx.userId}:`,
        error
      );
      throw new Error("Failed to retrieve location settings");
    }
  }

  @Authorized()
  @Mutation(() => LocationSettings)
  async updateLocationSettings(
    @Ctx() ctx: Context,
    @Arg("input") input: UpdateLocationSettingsInput
  ): Promise<LocationSettings> {
    try {
      return await UserService.updateLocationSettings(ctx.userId!, input);
    } catch (error) {
      logger.error(
        `Failed to update location settings for user ${ctx.userId}:`,
        error
      );
      throw new Error("Failed to update location settings");
    }
  }

  @Authorized()
  @Query(() => NFTVerificationResponse)
  async checkNFTAccess(@Ctx() ctx: Context): Promise<NFTVerificationResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId! },
        select: { walletAddress: true },
      });

      if (!user?.walletAddress) {
        throw new Error("Wallet not connected");
      }

      const access = await NFTVerificationService.hasNFTAccess(user.walletAddress);
      return {
        hasAccess: access.hasAccess,
        tokens: [], // checkNFTAccess does not return full token list
      };
    } catch (error) {
      logger.error(`Failed to check NFT access for user ${ctx.userId}:`, error);
      throw new Error("Failed to verify NFT access");
    }
  }

  @Authorized()
  @Mutation(() => NFTVerificationResponse)
  async refreshNFTStatus(
    @Ctx() ctx: Context
  ): Promise<NFTVerificationResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId! },
        select: { walletAddress: true },
      });

      if (!user?.walletAddress) {
        throw new Error("Wallet not connected");
      }

      // Invalidate cache to force a fresh check
      await NFTVerificationService.invalidateCache(user.walletAddress);
      
      // Verify ownership and get the list of tokens
      const { isHolder, nftTokens } = await NFTVerificationService.verifyNFTOwnership(user.walletAddress);

      return {
        hasAccess: isHolder,
        tokens: nftTokens.map(tokenMint => ({ tokenMint })),
      };
    } catch (error) {
      logger.error(
        `Failed to refresh NFT status for user ${ctx.userId}:`,
        error
      );
      throw new Error("Failed to refresh NFT status");
    }
  }
}
