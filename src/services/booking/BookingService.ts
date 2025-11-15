import { BookingStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";

export class BookingService {
  static async checkAvailability(
    shuttleId: string,
    requestedSeats: number
  ): Promise<boolean> {
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: {
        bookings: {
          where: {
            status: { not: BookingStatus.CANCELLED },
          },
        },
      },
    });

    if (!shuttle) {
      throw new Error("Shuttle not found");
    }

    const bookedSeats = shuttle.bookings.reduce(
      (sum: number, b: { numberOfSeats: number }) => sum + b.numberOfSeats,
      0
    );
    const availableSeats = shuttle.capacity - bookedSeats;

    return availableSeats >= requestedSeats;
  }

  static async cancelBooking(
    bookingId: string,
    userId: string
  ): Promise<boolean> {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status === "COMPLETED") {
      throw new Error("Cannot cancel completed booking");
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        paymentStatus: "REFUNDED",
      },
    });

    logger.info(`Booking cancelled: ${bookingId}`);
    return true;
  }

  static async rateBooking(
    bookingId: string,
    userId: string,
    rating: number,
    review?: string
  ): Promise<boolean> {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status !== "COMPLETED") {
      throw new Error("Can only rate completed bookings");
    }

    // Create update data object with proper typing
    const updateData: {
      rating: number;
      review?: string | null;
    } = { rating };
    
    // Only include review in update if it's provided
    if (review !== undefined) {
      updateData.review = review;
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
    });

    // Update driver rating
    const shuttle = await prisma.shuttle.findUnique({
      where: { id: booking.shuttleId },
      include: { driver: true },
    });

    if (shuttle?.driver) {
      const allRatings = await prisma.booking.findMany({
        where: {
          shuttle: { driverId: shuttle.driver.id },
          rating: { not: null },
        },
        select: { rating: true },
      });

      const avgRating =
        allRatings.reduce((sum: any, b:any) => sum + (b.rating || 0), 0) /
        allRatings.length;

      await prisma.driver.update({
        where: { id: shuttle.driver.id },
        data: { rating: avgRating },
      });
    }

    logger.info(`Booking rated: ${bookingId} - ${rating} stars`);
    return true;
  }
}
