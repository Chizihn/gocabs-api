import {  ObjectType, Field, ID, Int } from "type-graphql";

import { ShuttleStatus } from "@prisma/client";
import { GraphQLDateTimeISO, GraphQLJSONObject } from "graphql-scalars";

@ObjectType()
export class DriverStats {
  @Field(() => Int)
  totalRides: number;

  @Field(() => Int)
  rating: number;

  @Field(() => Int)
  totalEarnings: number;

  @Field(() => Int)
  todayEarnings: number;

  @Field(() => Int)
  weekEarnings: number;
}

@ObjectType()
export class RideAssignment {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  shuttleId: string;

  @Field(() => String)
  vehicleNumber: string;

  @Field(() => GraphQLDateTimeISO)
  departureTime: Date;

  @Field(() => GraphQLJSONObject)
  pickupLocation: any;

  @Field(() => GraphQLJSONObject)
  dropoffLocation: any;

  @Field(() => String)
  status: ShuttleStatus;

  @Field(() => Int)
  bookedSeats: number;

  @Field(() => Int)
  capacity: number;
}

@ObjectType()
export class DriverDetails {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  phoneNumber: string;

  @Field()
  licenseNumber: string;

  @Field()
  rating: number;

  @Field()
  totalRides: number;

  @Field()
  isOnline: boolean;

  @Field()
  isVerified: boolean;

  @Field()
  earnings: number;
}