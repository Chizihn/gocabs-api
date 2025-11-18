import { registerEnumType } from "type-graphql";
import { 
  UserRole, 
  StakeType, 
  StakingTier, 
  ShuttleStatus, 
  PaymentStatus, 
  BookingStatus, 
  NotificationType 
} from "@prisma/client";

registerEnumType(UserRole, {
  name: "UserRole",
});

registerEnumType(StakeType, {
  name: "StakeType",
});

registerEnumType(StakingTier, {
  name: "StakingTier",
});

registerEnumType(ShuttleStatus, {
  name: "ShuttleStatus",
});

registerEnumType(PaymentStatus, {
  name: "PaymentStatus",
});

registerEnumType(BookingStatus, {
  name: "BookingStatus",
});

registerEnumType(NotificationType, {
  name: "NotificationType",
});

export { 
  UserRole, 
  StakeType, 
  StakingTier, 
  ShuttleStatus, 
  PaymentStatus, 
  BookingStatus, 
  NotificationType 
};
