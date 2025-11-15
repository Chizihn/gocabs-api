-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcmToken" TEXT,
ADD COLUMN     "locationSettings" JSONB DEFAULT '{"shareLocation":true,"locationAccuracy":"high"}',
ADD COLUMN     "notificationSettings" JSONB DEFAULT '{"rideUpdates":true,"promotions":true,"rewards":true}';
