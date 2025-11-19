// src/services/NotificationService.ts
import * as admin from "firebase-admin";
import { logger } from "../../utils/logger";
import { prisma } from "../../config/database";
import { NotificationType } from "@prisma/client";

// ====================== Firebase Admin Init ======================
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        } as admin.ServiceAccount),
      });
      logger.info("Firebase Admin initialized successfully");
    } else {
      logger.warn("Missing Firebase credentials. Push notifications disabled.");
    }
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin:", error);
  }
}

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ====================== NotificationService ======================
export class NotificationService {
  private static async sendPushAndSaveDB(
    userId: string,
    payload: NotificationPayload,
    type: NotificationType = NotificationType.SYSTEM
  ): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true, notificationSettings: true },
      });

      if (!user) {
        logger.warn(`User ${userId} not found for notification`);
        return false;
      }

      // Respect user notification preferences
      const settings = (user.notificationSettings as any) || {};
      const notificationTypeKey = payload.data?.type;

      if (
        notificationTypeKey === "promotions" &&
        settings.promotions === false
      ) {
        return false;
      }
      if (
        notificationTypeKey === "rideUpdates" &&
        settings.rideUpdates === false
      ) {
        return false;
      }

      // Save to database first (inbox)
      await prisma.notification.create({
        data: {
          userId,
          title: payload.title,
          body: payload.body,
          type,
          data: payload.data || {},
        },
      });

      // If no FCM token, stop here (still saved in DB)
      if (!user.fcmToken) {
        logger.debug(`No FCM token for user ${userId}, saved to DB only`);
        return true;
      }

      const message: admin.messaging.TokenMessage = {
        token: user.fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data
          ? Object.fromEntries(
              Object.entries(payload.data).map(([k, v]) => [k, String(v)])
            )
          : {},
        android: {
          priority: "high",
          notification: {
            channelId: "gocabs_notifications",
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              category: "BOOKING_UPDATE",
            },
          },
          headers: {
            "apns-push-type": "background",
            "apns-priority": "5",
          },
        },
      };

      try {
        const response = await admin.messaging().send(message);
        logger.info(`Push sent to ${userId}: ${response}`);
        return true;
      } catch (pushError: any) {
        logger.error(`FCM send failed for user ${userId}:`, pushError.errorInfo?.message);

        // Clean up invalid tokens
        if (
          pushError.errorInfo?.code === "messaging/registration-token-not-registered" ||
          pushError.errorInfo?.code === "messaging/invalid-registration-token"
        ) {
          await prisma.user.update({
            where: { id: userId },
            data: { fcmToken: null },
          });
          logger.info(`Cleared invalid FCM token for user ${userId}`);
        }
        return false; // Push failed, but DB record exists
      }
    } catch (error) {
      logger.error(`Notification failed for user ${userId}:`, error);
      return false;
    }
  }

  // ====================== Core Methods ======================
  static async sendToUser(
    userId: string,
    payload: NotificationPayload,
    type?: NotificationType
  ): Promise<boolean> {
    const dbType = type || NotificationType.SYSTEM;
    return this.sendPushAndSaveDB(userId, payload, dbType);
  }

  static async sendToMultipleUsers(
    userIds: string[],
    payload: NotificationPayload,
    type: NotificationType = NotificationType.SYSTEM
  ): Promise<void> {
    await Promise.allSettled(
      userIds.map((id) => this.sendPushAndSaveDB(id, payload, type))
    );
  }

  // ====================== Ride Updates ======================
  static async sendRideUpdate(
    userId: string,
    type: "arrived" | "boarding" | "departed" | "completed",
    bookingId: string,
    shuttleId?: string
  ): Promise<void> {
    const messages: Record<typeof type, NotificationPayload> = {
      arrived: {
        title: "Your Shuttle Has Arrived",
        body: "The driver is at the pickup location",
        data: { type: "rideUpdate", action: "arrived", bookingId, },
      },
      boarding: {
        title: "Boarding Started",
        body: "Please board the shuttle now",
        data: { type: "rideUpdate", action: "boarding", bookingId },
      },
      departed: {
        title: "On Our Way!",
        body: "Your shuttle has departed for the event",
        data: { type: "rideUpdate", action: "departed", bookingId },
      },
      completed: {
        title: "Ride Completed",
        body: "Thanks for riding with GoCabs! Rate your experience",
        data: { type: "rideUpdate", action: "completed", bookingId },
      },
    };

    await this.sendPushAndSaveDB(userId, messages[type], NotificationType.RIDE_UPDATE);
  }

  // ====================== Booking Flow ======================
  static async sendBookingConfirmation(
    userId: string,
    bookingId: string,
    eventName: string
  ): Promise<void> {
    await this.sendPushAndSaveDB(
      userId,
      {
        title: "Booking Confirmed!",
        body: `Your seat for ${eventName} is confirmed`,
        data: { type: "booking", action: "confirmed", bookingId },
      },
      NotificationType.BOOKING_CONFIRMED
    );
  }

  // THIS WAS MISSING — NOW ADDED
  static async sendBookingCancelled(
    userId: string,
    bookingId: string,
    reason?: string
  ): Promise<void> {
    const body = reason
      ? `Your booking has been cancelled: ${reason}`
      : "Your booking has been cancelled";

    await this.sendPushAndSaveDB(
      userId,
      {
        title: "Booking Cancelled",
        body,
        data: { type: "booking", action: "cancelled", bookingId },
      },
      NotificationType.BOOKING_CANCELLED
    );
  }

  // ====================== Rewards ======================
  static async sendRewardNotification(
    userId: string,
    xpEarned: number,
    co2SavedKg: number,
    usdcValue?: number
  ): Promise<void> {
    const body = usdcValue
      ? `You earned ${xpEarned} XP, saved ${co2SavedKg}kg CO₂, and $${usdcValue.toFixed(2)} USDC!`
      : `You earned ${xpEarned} XP and saved ${co2SavedKg}kg CO₂`;

    await this.sendPushAndSaveDB(
      userId,
      {
        title: "Rewards Earned!",
        body,
        data: { type: "rewards", xp: String(xpEarned), co2: String(co2SavedKg) },
      },
      NotificationType.REWARD_EARNED
    );
  }

  // ====================== Promotions ======================
  static async sendPromotion(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    await this.sendPushAndSaveDB(
      userId,
      { title, body, data: { type: "promotions", ...data } },
      NotificationType.PROMOTION
    );
  }
}