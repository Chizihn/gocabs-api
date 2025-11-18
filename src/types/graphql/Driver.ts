import { ObjectType, Field, ID, InputType, Float, Int } from "type-graphql";
import { Decimal } from "@prisma/client/runtime/library";
import { GraphQLDecimal } from "./scalers/Decimal";
import { User } from "./User";
import { Shuttle } from "./Shuttle";
import { ShuttleStatus } from "@prisma/client";
import { GraphQLJSONObject } from "graphql-scalars";

@ObjectType()
export class Driver {
  @Field(() => ID)
  id!: string;

  @Field(() => User)
  user!: User;

  @Field(() => String, { nullable: true })
  licenseNumber?: string | null;

  @Field(() => GraphQLDecimal)
  rating!: Decimal;

  @Field(() => Int)
  totalRides!: number;

  @Field(() => Boolean)
  isOnline!: boolean;

  @Field(() => Boolean)
  isVerified!: boolean;

  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  @Field(() => GraphQLDecimal)
  earnings!: Decimal;
}

@ObjectType()
class Passenger {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  phone!: string;
}

@ObjectType()
class RouteInfo {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => GraphQLJSONObject)
  startLocation!: any;

  @Field(() => GraphQLJSONObject)
  endLocation!: any;

  @Field(() => [GraphQLJSONObject])
  waypoints!: any[];
}

@ObjectType()
export class RideAssignment {
  @Field(() => ID)
  shuttleId!: string;

  @Field(() => ID)
  eventId!: string;

  @Field()
  licensePlate!: string;

  @Field()
  vehicleType!: string;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => GraphQLJSONObject)
  pickupLocation!: any;

  @Field(() => GraphQLJSONObject)
  dropoffLocation!: any;

  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  @Field(() => Int)
  capacity!: number;

  @Field(() => Int)
  bookedSeats!: number;

  @Field(() => [Passenger])
  passengers!: Passenger[];

  @Field(() => RouteInfo)
  route!: RouteInfo;
}

@ObjectType()
export class DriverStats {
  @Field()
  totalRides!: number;

  @Field(() => Float)
  rating!: number;

  @Field(() => Float)
  totalEarnings!: number;

  @Field(() => Float)
  todayEarnings!: number;

  @Field(() => Float)
  weekEarnings!: number;

  @Field(() => RideAssignment, { nullable: true })
  currentAssignment?: RideAssignment | null;
}

@InputType()
export class CreateDriverInput {
  @Field()
  userId!: string;

  @Field({ nullable: true })
  licenseNumber?: string;
}

@InputType()
export class UpdateDriverInput {
  @Field({ nullable: true })
  licenseNumber?: string;

  @Field({ nullable: true })
  isOnline?: boolean;

  @Field({ nullable: true })
  isVerified?: boolean;

  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;
}
