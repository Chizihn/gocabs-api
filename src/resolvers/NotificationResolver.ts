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
import { Notification } from "../types/graphql/Notification";
import type { MarkNotificationReadInput } from "../types/graphql/Notification";
import { logger } from "../utils/logger";

@Resolver(() => Notification)
export class NotificationResolver {
  @Authorized()
  @Query(() => [Notification])
  async myNotifications(
    @Arg("limit", () => Int, { nullable: true, defaultValue: 50 })
    limit: number,
    @Arg("offset", () => Int, { nullable: true, defaultValue: 0 })
    offset: number,
    @Arg("unreadOnly", () => Boolean, { nullable: true, defaultValue: false })
    unreadOnly: boolean,
    @Ctx() ctx: Context
  ): Promise<Notification[]> {
    const where: any = {
      userId: ctx.userId!,
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return notifications as any;
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
  @Mutation(() => Boolean)
  async markNotificationRead(
    @Arg("notificationId", () => ID) notificationId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: ctx.userId!,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return true;
  }

  @Authorized()
  @Mutation(() => Boolean)
  async markAllNotificationsRead(@Ctx() ctx: Context): Promise<boolean> {
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
    return true;
  }

  @Authorized()
  @Mutation(() => Boolean)
  async deleteNotification(
    @Arg("id") id: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    await prisma.notification.deleteMany({
      where: {
        id,
        userId: ctx.userId!,
      },
    });

    return true;
  }
}
