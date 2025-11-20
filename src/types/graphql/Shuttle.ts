import {
  ObjectType,
  Field,
  ID,
  InputType,
  Float,
  registerEnumType,
  Int,
} from "type-graphql";
import { ShuttleStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import { Event } from "./Event";
import { Driver } from "./Driver";
import { Vehicle } from "./Vehicle";
import { Booking } from "./Booking";
import { StakedNFT } from "./Staking";
import { Location, LocationInput } from "./Location";
import { GraphQLDecimal } from "./scalers/Decimal"; // your custom Decimal scalar
import { PaginatedResponse } from "./responses";

registerEnumType(ShuttleStatus, {
  name: "ShuttleStatus",
  description: "Current status of the shuttle ride",
});

// ====================== SHUTTLE OBJECT TYPE ======================
@ObjectType()
export class Shuttle {
  @Field(() => ID)
  id!: string;

  // Relations
  @Field(() => ID)
  eventId!: string;

  @Field(() => Event)
  event!: Event;

  @Field(() => ID)
  vehicleId!: string;

  @Field(() => Vehicle)
  vehicle!: Vehicle;

  @Field(() => ID, { nullable: true })
  driverId?: string | null;

  @Field(() => Driver, { nullable: true })
  driver?: Driver | null;

  // Timestamps
  @Field(() => Date)
  departureTime!: Date;

  @Field(() => Date)
  arrivalTime!: Date;

  // Locations (stored as JSON in DB)
  @Field(() => Location)
  pickupLocation!: Location;

  @Field(() => Location)
  dropoffLocation!: Location;

  // Pricing & Status
  @Field(() => GraphQLDecimal)
  basePriceUsdc!: Decimal;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  isFractionalized!: boolean;

  // Live tracking
  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  @Field(() => Date, { nullable: true })
  lastLocationUpdate?: Date | null;

  // Relations (optional in queries)
  @Field(() => [Booking], { nullable: true })
  bookings?: Booking[];

  @Field(() => [StakedNFT], { nullable: true })
  stakedNFTs?: StakedNFT[];

  // Timestamps
  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

// ====================== CREATE SHUTTLE INPUT ======================
@InputType()
export class CreateShuttleInput {
  @Field(() => ID)
  eventId!: string;

  @Field(() => ID)
  vehicleId!: string;

  @Field(() => ID, { nullable: true })
  driverId?: string | null;

  @Field(() => Date)
  departureTime!: Date;

  @Field(() => Date)
  arrivalTime!: Date;

  @Field(() => LocationInput)
  pickupLocation!: LocationInput;

  @Field(() => LocationInput)
  dropoffLocation!: LocationInput;

  @Field(() => GraphQLDecimal)
  basePriceUsdc!: Decimal;

  @Field({ defaultValue: false })
  isFractionalized?: boolean;
}

// ====================== UPDATE SHUTTLE INPUT ======================
@InputType()
export class UpdateShuttleInput {
  @Field(() => ID, { nullable: true })
  driverId?: string | null;

  @Field(() => Date, { nullable: true })
  departureTime?: Date;

  @Field(() => Date, { nullable: true })
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

  // Live location updates (driver app)
  @Field(() => Float, { nullable: true })
  currentLat?: number | null;

  @Field(() => Float, { nullable: true })
  currentLng?: number | null;

  // Optional: manually set last update time (usually auto-managed)
  @Field(() => Date, { nullable: true })
  lastLocationUpdate?: Date | null;
}

@ObjectType()
export class PaginatedShuttlesResponse extends PaginatedResponse(Shuttle) {}
