import * as admin from "firebase-admin";
import { logger } from "../../utils/logger";
import { prisma } from "../../config/database";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      });
    } else {
      logger.warn("Firebase service account not configured");
    }
  } catch (error) {
    logger.error("Failed to initialize Firebase:", error);
  }
}

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export class NotificationService {
  static async sendToUser(
    userId: string,
    payload: NotificationPayload
  ): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true, notificationSettings: true },
      });

      if (!user?.fcmToken) {
        logger.warn(`No FCM token found for user ${userId}`);
        return false;
      }

      // Check notification settings
      const settings = (user.notificationSettings as any) || {};
      if (payload.data?.type === "promotions" && settings.promotions === false) {
        return false;
      }

      // Create a properly typed message object
      const message: admin.messaging.TokenMessage = {
        token: user.fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ? 
          Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)])
          ) : {},
        android: {
          priority: "high" as const,
          notification: {
            channelId: "gocabs_notifications",
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      logger.info(`Notification sent to user ${userId}: ${response}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to send notification to user ${userId}:`, error);
      
      // Handle invalid token
      if (error?.code === "messaging/invalid-registration-token" || 
          error?.code === "messaging/registration-token-not-registered") {
        // Remove invalid token
        await prisma.user.update({
          where: { id: userId },
          data: { fcmToken: null },
        });
      }
      
      return false;
    }
  }

  static async sendToMultipleUsers(
    userIds: string[],
    payload: NotificationPayload
  ): Promise<void> {
    const promises = userIds.map((userId) => this.sendToUser(userId, payload));
    await Promise.all(promises);
  }

  static async sendRideUpdate(
    userId: string,
    type: "arrived" | "boarding" | "departed" | "completed",
    bookingId: string
  ): Promise<void> {
    const messages: Record<string, NotificationPayload> = {
      arrived: {
        title: "Shuttle Arrived",
        body: "Your shuttle has arrived at the pickup location",
        data: { type: "rideUpdate", bookingId },
      },
      boarding: {
        title: "Boarding Started",
        body: "Shuttle boarding has begun",
        data: { type: "rideUpdate", bookingId },
      },
      departed: {
        title: "Shuttle Departed",
        body: "Your shuttle has departed for the event",
        data: { type: "rideUpdate", bookingId },
      },
      completed: {
        title: "Ride Completed",
        body: "Thank you for using GoCabs! Don't forget to rate your ride.",
        data: { type: "rideUpdate", bookingId },
      },
    };

    const message = messages[type];
    if (message) {
      await this.sendToUser(userId, message);
    }
  }

  static async sendRewardNotification(
    userId: string,
    xpEarned: number,
    co2Xp: number
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: "Rewards Earned! 🎉",
      body: `You earned ${xpEarned} XP and ${co2Xp} CO2 XP for your ride`,
      data: { type: "rewards" },
    });
  }

  static async sendBookingConfirmation(
    userId: string,
    bookingId: string,
    eventName: string
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: "Booking Confirmed",
      body: `Your shuttle booking for ${eventName} is confirmed`,
      data: { type: "booking", bookingId },
    });
  }
}

