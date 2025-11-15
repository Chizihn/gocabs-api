import { registerEnumType } from "type-graphql";
import {
  BookingStatus,
  PaymentStatus,
  ShuttleStatus,
  StakingTier,
  UserRole,
  PayoutType,
  PayoutStatus,
} from "@prisma/client";

// Register all enums with TypeGraphQL
const registerEnums = () => {
  // UserRole enum
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

  // ShuttleStatus enum
  registerEnumType(ShuttleStatus, {
    name: "ShuttleStatus",
    description: "Current status of a shuttle",
    valuesConfig: {
      SCHEDULED: { description: "Shuttle is scheduled but not yet active" },
      BOARDING: { description: "Shuttle is boarding passengers" },
      IN_TRANSIT: { description: "Shuttle is currently in transit" },
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

  // BookingStatus enum
  registerEnumType(BookingStatus, {
    name: "BookingStatus",
    description: "Status of a booking",
    valuesConfig: {
      CONFIRMED: { description: "Booking is confirmed" },
      CHECKED_IN: { description: "Passenger has checked in" },
      COMPLETED: { description: "Ride has been completed" },
    },
  });

  // StakingTier enum
  registerEnumType(StakingTier, {
    name: "StakingTier",
    description: "Tier levels for staking rewards",
    valuesConfig: {
      TIER_1: { description: "1 NFT - 25% share of rewards" },
      TIER_2: { description: "3+ NFTs - 40% share of rewards" },
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
};

// Execute the registration
registerEnums();

// Export all enums for use in other files
export {
  UserRole,
  ShuttleStatus,
  PaymentStatus,
  BookingStatus,
  StakingTier,
  PayoutType,
  PayoutStatus,
};
