import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  Int,
  ID,
} from "type-graphql";
import { prisma } from "../config/database";
import { Context } from "../types/Context";
import {
  Notification,
  PaginatedNotificationsResponse,
} from "../types/graphql/Notification";
import type { MarkNotificationReadInput } from "../types/graphql/Notification";
import { logger } from "../utils/logger";
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";

@Resolver(() => Notification)
export class NotificationResolver {
  @Authorized()
  @Query(() => PaginatedNotificationsResponse)
  async myNotifications(
    @Ctx() ctx: Context,
    @Arg("pagination") pagination: PaginationInput,
    @Arg("unreadOnly", () => Boolean, { nullable: true, defaultValue: false })
    unreadOnly: boolean,
    @Arg("sort", { nullable: true }) sort?: SortInput
  ): Promise<PaginatedNotificationsResponse> {
    const where: any = {
      userId: ctx.userId!,
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { createdAt: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      items: items as any,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Authorized()
  @Query(() => Notification, { nullable: true })
  async notification(
    @Arg("id") id: string,
    @Ctx() ctx: Context
  ): Promise<Notification | null> {
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: ctx.userId!,
      },
    });

    return notification as any;
  }

  @Authorized()
  @Query(() => Number)
  async unreadNotificationCount(@Ctx() ctx: Context): Promise<number> {
    return prisma.notification.count({
      where: {
        userId: ctx.userId!,
        isRead: false,
      },
    });
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async markNotificationRead(
    @Arg("notificationId", () => ID) notificationId: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      const { count } = await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId: ctx.userId!,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      if (count > 0) {
        return { success: true, message: "Notification marked as read." };
      }
      return {
        success: false,
        message:
          "Notification not found or you do not have permission to read it.",
      };
    } catch (error: any) {
      logger.error(
        `Failed to mark notification ${notificationId} as read:`,
        error
      );
      return {
        success: false,
        message: "Failed to mark notification as read.",
      };
    }
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async markAllNotificationsRead(@Ctx() ctx: Context): Promise<BaseResponse> {
    try {
      await prisma.notification.updateMany({
        where: {
          userId: ctx.userId!,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      logger.info(`All notifications marked as read for user ${ctx.userId}`);
      return { success: true, message: "All notifications marked as read." };
    } catch (error: any) {
      logger.error(
        `Failed to mark all notifications as read for user ${ctx.userId}:`,
        error
      );
      return {
        success: false,
        message: "Failed to mark all notifications as read.",
      };
    }
  }

  @Authorized()
  @Mutation(() => BaseResponse)
  async deleteNotification(
    @Arg("id") id: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    try {
      const { count } = await prisma.notification.deleteMany({
        where: {
          id,
          userId: ctx.userId!,
        },
      });
      if (count > 0) {
        return { success: true, message: "Notification deleted." };
      }
      return {
        success: false,
        message:
          "Notification not found or you do not have permission to delete it.",
      };
    } catch (error: any) {
      logger.error(`Failed to delete notification ${id}:`, error);
      return { success: false, message: "Failed to delete notification." };
    }
  }
}
