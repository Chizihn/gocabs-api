import { ObjectType, Field, ID, InputType, Int, Float } from "type-graphql";
import { BookingStatus, ShuttleStatus, UserRole } from "@prisma/client";
import { GraphQLJSONObject } from "graphql-scalars";
import { Driver } from "./Driver";
import { Owner } from "./Owner";

@ObjectType()
export class UserStats {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  seekers!: number;

  @Field(() => Int)
  drivers!: number;

  @Field(() => Int)
  owners!: number;
}

@ObjectType()
export class EventStats {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  active!: number;
}

@ObjectType()
export class ShuttleStats {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  active!: number;
}

@ObjectType()
export class BookingStats {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  completed!: number;
}

@ObjectType()
export class RevenueStats {
  @Field(() => Float)
  total!: number;

  @Field(() => Float)
  month!: number;
}

@ObjectType()
export class DashboardStats {
  @Field(() => UserStats)
  users!: UserStats;

  @Field(() => EventStats)
  events!: EventStats;

  @Field(() => ShuttleStats)
  shuttles!: ShuttleStats;

  @Field(() => BookingStats)
  bookings!: BookingStats;

  @Field(() => RevenueStats)
  revenue!: RevenueStats;
}

@ObjectType()
export class UserWithProfiles {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  walletAddress?: string | null;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  username?: string | null;

  @Field(() => String, { nullable: true })
  phoneNumber?: string | null;

  @Field(() => UserRole)
  role!: UserRole;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => Driver, { nullable: true })
  driver?: Driver | null;

  @Field(() => Owner, { nullable: true })
  owner?: Owner | null;
}

@InputType()
export class AdminCreateShuttleInput {
  @Field()
  eventId!: string;

  @Field()
  licensePlate!: string;

  @Field()
  vehicleType!: string;

  @Field(() => Int)
  capacity!: number;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => GraphQLJSONObject)
  pickupLocation!: Record<string, unknown>;

  @Field(() => GraphQLJSONObject)
  dropoffLocation!: Record<string, unknown>;

  @Field()
  basePriceUsdc!: number;

  @Field({ nullable: true })
  isFractionalized?: boolean;

  @Field(() => ID, { nullable: true })
  driverId?: string;
}

@ObjectType()
export class EventResponse {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => GraphQLJSONObject)
  location!: Record<string, unknown>;

  @Field()
  eventDate!: Date;

  @Field()
  eventType!: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class ShuttleResponse {
  @Field(() => ID)
  id!: string;

  @Field()
  eventId!: string;

  @Field()
  licensePlate!: string;

  @Field()
  vehicleType!: string;

  @Field(() => Int)
  capacity!: number;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => GraphQLJSONObject)
  pickupLocation!: Record<string, unknown>;

  @Field(() => GraphQLJSONObject)
  dropoffLocation!: Record<string, unknown>;

  @Field(() => Float)
  basePriceUsdc!: number;

  @Field(() => Int)
  availableSeats!: number;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  isFractionalized!: boolean;

  @Field(() => ID, { nullable: true })
  driverId?: string;
}

@ObjectType()
export class AnalyticsPeriod {
  @Field()
  start!: Date;

  @Field()
  end!: Date;
}

@ObjectType()
export class BookingStatusCount {
  @Field(() => BookingStatus)
  status!: BookingStatus;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class ShuttleStatusCount {
  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AnalyticsBookings {
  @Field(() => Int)
  total!: number;

  @Field(() => [BookingStatusCount])
  byStatus!: BookingStatusCount[];
}

@ObjectType()
export class AnalyticsShuttles {
  @Field(() => Int)
  total!: number;

  @Field(() => [ShuttleStatusCount])
  byStatus!: ShuttleStatusCount[];
}

@ObjectType()
export class AnalyticsRevenue {
  @Field(() => Float)
  total!: number;

  @Field()
  currency!: string;
}

@ObjectType()
export class AdminAnalytics {
  @Field(() => AnalyticsPeriod)
  period!: AnalyticsPeriod;

  @Field(() => AnalyticsBookings)
  bookings!: AnalyticsBookings;

  @Field(() => AnalyticsShuttles)
  shuttles!: AnalyticsShuttles;

  @Field(() => AnalyticsRevenue)
  revenue!: AnalyticsRevenue;
}
