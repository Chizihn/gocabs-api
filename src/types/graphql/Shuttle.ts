import { ObjectType, Field, ID, InputType } from "type-graphql";
import { Event, Location } from "./Event";
import { GraphQLDecimal } from "./scalers/Decimal";
import type { Decimal } from "@prisma/client/runtime/library";
import { LocationInput } from "./inputs/index";
import { ShuttleStatus } from "@prisma/client";


@ObjectType()
export class Shuttle {
  @Field(() => ID)
  id: string;

  @Field()
  eventId: string;

  @Field()
  vehicleNumber: string;

  @Field()
  capacity: number;

  @Field()
  departureTime: Date;

  @Field()
  arrivalTime: Date;

  @Field(() => Location)
  pickupLocation: Location;

  @Field(() => Location)
  dropoffLocation: Location;

  @Field(() => GraphQLDecimal)
  basePrice: Decimal | string;

  @Field()
  currency: string;

  @Field(() => ShuttleStatus)
  status: ShuttleStatus;

  @Field()
  isFractionalized: boolean;

  @Field(() => Location, { nullable: true })
  currentLocation?: Location;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field()
  availableSeats: number;
}

@InputType()
export class CreateShuttleInput {
  @Field()
  eventId: string;

  @Field()
  vehicleNumber: string;

  @Field()
  capacity: number;

  @Field()
  departureTime: Date;

  @Field()
  arrivalTime: Date;

  @Field(() => LocationInput)
  pickupLocation: LocationInput;

  @Field(() => LocationInput)
  dropoffLocation: LocationInput;

  @Field()
  basePrice: number;

  @Field(() => Boolean, { defaultValue: false })
  isFractionalized: boolean;
}
