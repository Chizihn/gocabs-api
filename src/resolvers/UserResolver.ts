import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import {
  User,
  AuthResponse,
  UpdateUserProfileInput,
  RegisterInput,
  AdminUpdateUserInput,
  PaginatedUsersResponse,
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
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";
import { User as PrismaUser, Prisma, UserRole } from "@prisma/client";

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
  async register(@Arg("input") input: RegisterInput): Promise<AuthResponse> {
    const { user, token, nftAccess } = await UserService.register(
      "", // walletAddress is not available in this flow
      input.email,
      input.username,
      input.password,
      input.role,
      input.companyName,
      input.licenseNumber
    );

    return {
      token,
      user: toGqlUser(user),
      hasNFTAccess: nftAccess.hasAccess,
    };
  }

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

  @Authorized("ADMIN")
  @Query(() => PaginatedUsersResponse)
  async adminUsers(
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput,
    @Arg("role", () => UserRole, { nullable: true }) role?: UserRole
  ): Promise<PaginatedUsersResponse> {
    const where: Prisma.UserWhereInput = role ? { role } : {};
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { createdAt: "desc" as const };

    try {
      const [items, totalItems] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          take: limit,
          skip: (page - 1) * limit,
          orderBy,
          include: {
            driver: true,
            owner: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      return {
        items: items.map(toGqlUser),
        pagination: {
          totalItems,
          page,
          limit,
          totalPages: Math.ceil(totalItems / limit),
          hasNextPage: page * limit < totalItems,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      logger.error("Error fetching all users:", error);
      throw new Error("Failed to fetch users");
    }
  }

  @Authorized("ADMIN")
  @Query(() => User, { nullable: true })
  async adminUser(@Arg("id") id: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          driver: true,
          owner: true,
        },
      });
      return user ? toGqlUser(user) : null;
    } catch (error) {
      logger.error(`Error fetching user ${id}:`, error);
      throw new Error("Failed to fetch user");
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => User)
  async adminCreateUser(@Arg("input") input: RegisterInput): Promise<User> {
    try {
      const { user } = await UserService.register(
        "", // walletAddress is not part of RegisterInput for adminCreateUser
        input.email,
        input.username,
        input.password,
        input.role,
        input.companyName,
        input.licenseNumber
      );
      return toGqlUser(user);
    } catch (error) {
      logger.error("Error creating user:", error);
      throw new Error("Failed to create user");
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => User)
  async adminUpdateUser(
    @Arg("id") id: string,
    @Arg("input") input: AdminUpdateUserInput
  ): Promise<User> {
    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id },
          include: {
            driver: true,
            owner: true,
          },
        });
        if (!existingUser) {
          throw new Error("User not found");
        }

        const dataToUpdate: Prisma.UserUpdateInput = {};
        if (input.email !== undefined) dataToUpdate.email = input.email;
        if (input.username !== undefined)
          dataToUpdate.username = input.username;
        if (input.phoneNumber !== undefined)
          dataToUpdate.phoneNumber = input.phoneNumber;
        if (input.avatar !== undefined) dataToUpdate.avatar = input.avatar;
        if (input.fcmToken !== undefined)
          dataToUpdate.fcmToken = input.fcmToken;
        if (input.role !== undefined) dataToUpdate.role = input.role;
        if (input.walletAddress !== undefined)
          dataToUpdate.walletAddress = input.walletAddress;

        const user = await tx.user.update({
          where: { id },
          data: dataToUpdate,
          include: {
            driver: true,
            owner: true,
          },
        });

        // Handle role changes: if user becomes a DRIVER or OWNER, create respective profile
        if (input.role === "DRIVER" && !existingUser.driver) {
          await tx.driver.create({ data: { userId: user.id } });
        } else if (input.role === "OWNER" && !existingUser.owner) {
          await tx.owner.create({ data: { userId: user.id } });
        }
        return user;
      });

      return toGqlUser(updatedUser);
    } catch (error) {
      logger.error(`Error updating user ${id}:`, error);
      throw new Error("Failed to update user");
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => BaseResponse)
  async adminDeleteUser(@Arg("id") id: string): Promise<BaseResponse> {
    try {
      // You might want to add more logic here, e.g., not allowing to delete oneself
      await prisma.user.delete({ where: { id } });
      logger.info(`User deleted: ${id}`);
      return { success: true, message: "User deleted successfully." };
    } catch (error) {
      logger.error(`Error deleting user ${id}:`, error);
      return { success: false, message: "Failed to delete user." };
    }
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async logout(@Ctx() ctx: Context): Promise<BaseResponse> {
    const token = ctx.req.headers.authorization?.split(" ")[1];
    if (token) {
      const success = await UserService.logout(token);
      return {
        success,
        message: success ? "Logged out successfully." : "Logout failed.",
      };
    }
    return { success: false, message: "No token provided." };
  }

  @Authorized()
  @Mutation(() => User)
  async uploadAvatar(
    @Ctx() ctx: Context,
    @Arg("avatarUrl") avatarUrl: string
  ): Promise<User> {
    const updatedUser = await UserService.uploadAvatar(ctx.userId!, avatarUrl);
    return toGqlUser(updatedUser);
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
    if (input.email !== undefined) dataToUpdate.email = input.email;
    if (input.username !== undefined) dataToUpdate.username = input.username;
    if (input.phoneNumber !== undefined)
      dataToUpdate.phoneNumber = input.phoneNumber;

    const updated = await UserService.updateProfile(ctx.userId!, dataToUpdate);

    return toGqlUser(updated);
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async updateFCMToken(
    @Ctx() ctx: Context,
    @Arg("fcmToken") fcmToken: string
  ): Promise<BaseResponse> {
    try {
      await prisma.user.update({
        where: { id: ctx.userId! },
        data: { fcmToken },
      });
      logger.info(`FCM token updated for user ${ctx.userId}`);
      return { success: true, message: "FCM token updated." };
    } catch (error) {
      logger.error(`Failed to update FCM token for user ${ctx.userId}:`, error);
      return { success: false, message: "Failed to update FCM token." };
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

      const access = await NFTVerificationService.hasNFTAccess(
        user.walletAddress
      );
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
      const { isHolder, nftTokens } =
        await NFTVerificationService.verifyNFTOwnership(user.walletAddress);

      return {
        hasAccess: isHolder,
        tokens: nftTokens.map((tokenMint) => ({ tokenMint })),
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
