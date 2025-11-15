import { ObjectType, Field, ID, InputType } from "type-graphql";

import { GraphQLDecimal } from "./scalers/Decimal";
import type { Decimal } from "@prisma/client/runtime/library";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import { Shuttle } from "./Shuttle";

@ObjectType()
export class Booking {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  shuttleId: string;

  @Field()
  bookingDate: Date;

  @Field()
  numberOfSeats: number;

  @Field(() => GraphQLDecimal)
  totalPrice: Decimal | string;

  @Field(() => PaymentStatus)
  paymentStatus: PaymentStatus;

  @Field(() => String, { nullable: true })
  transactionHash?: string;

  @Field(() => BookingStatus)
  status: BookingStatus;

  @Field(() => Number, { nullable: true })
  rating?: number;

  @Field(() => String, { nullable: true })
  review?: string;

  @Field(() => Shuttle, { nullable: true })
  shuttle?: Shuttle;

  @Field()
  createdAt: Date;
}

@InputType()
export class CreateBookingInput {
  @Field()
  shuttleId: string;

  @Field(() => Number, { defaultValue: 1 })
  numberOfSeats: number;
}

@ObjectType()
export class BookingResponse {
  @Field(() => Booking)
  booking: Booking;

  @Field()
  paymentUrl: string;

  @Field()
  reference: string;
}
