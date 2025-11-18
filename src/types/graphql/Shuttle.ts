import {
  ObjectType,
  Field,
  ID,
  InputType,
  Float,
  registerEnumType,
  Int,
  GraphQLISODateTime,
} from "type-graphql";
import { ShuttleStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { GraphQLJSONObject } from "graphql-scalars";
import { Event } from "./Event";
import { Driver } from "./Driver";
import { Booking } from "./Booking";
import { StakedNFT } from "./Staking";
import { Location, LocationInput } from "./Location";
import { GraphQLDecimal } from "./scalers/Decimal";

registerEnumType(ShuttleStatus, {
  name: "ShuttleStatus",
});

@ObjectType()
export class Shuttle {
  @Field(() => ID)
  id!: string;

  @Field()
  eventId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field()
  licensePlate!: string;

  @Field()
  vehicleType!: string;

  @Field()
  capacity!: number;

  @Field()
  availableSeats!: number;

  @Field({ nullable: true })
  driverId?: string;

  @Field(() => Driver, { nullable: true })
  driver?: Driver | null;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => GraphQLJSONObject)
  pickupLocation!: Record<string, unknown>;

  @Field(() => GraphQLJSONObject)
  dropoffLocation!: Record<string, unknown>;

  @Field(() => GraphQLDecimal)
  basePriceUsdc!: Decimal;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  isFractionalized!: boolean;

  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  @Field({ nullable: true })
  lastLocationUpdate?: Date;

  @Field(() => [Booking], { nullable: true })
  bookings?: Booking[];

  @Field(() => [StakedNFT], { nullable: true })
  stakedNFTs?: StakedNFT[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@InputType()
export class CreateShuttleInput {
  @Field()
  eventId!: string;

  @Field()
  licensePlate!: string;

  @Field({ defaultValue: "minibus" })
  vehicleType!: string;

  @Field()
  capacity!: number;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => LocationInput)
  pickupLocation!: LocationInput;

  @Field(() => LocationInput)
  dropoffLocation!: LocationInput;

  @Field(() => GraphQLDecimal)
  basePriceUsdc!: Decimal;

  @Field({ defaultValue: false })
  isFractionalized!: boolean;

  @Field({ nullable: true })
  driverId?: string;
}

@InputType()
export class UpdateShuttleInput {
  @Field(() => String, { nullable: true })
  licensePlate?: string;

  @Field(() => String, { nullable: true })
  vehicleType?: string;

  @Field(() => Int, { nullable: true })
  capacity?: number;

  @Field(() => Int, { nullable: true })
  availableSeats?: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  departureTime?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  arrivalTime?: Date;

  @Field(() => LocationInput, { nullable: true })
  pickupLocation?: LocationInput;

  @Field(() => LocationInput, { nullable: true })
  dropoffLocation?: LocationInput;

  @Field(() => GraphQLDecimal, { nullable: true })
  basePriceUsdc?: Decimal;

  @Field(() => ShuttleStatus, { nullable: true })
  status?: ShuttleStatus;

  @Field(() => Boolean, { nullable: true })
  isFractionalized?: boolean;

  @Field(() => ID, { nullable: true })
  driverId?: string | null;

  @Field(() => Int, { nullable: true })
  currentLat?: number | null;

  @Field(() => Int, { nullable: true })
  currentLng?: number | null;
}
