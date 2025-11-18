import {
  ObjectType,
  Field,
  ID,
  InputType,
  Int,
  registerEnumType,
  Float,
} from "type-graphql";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { Reward } from "./Reward";

registerEnumType(BookingStatus, {
  name: "BookingStatus",
});

registerEnumType(PaymentStatus, {
  name: "PaymentStatus",
});

@ObjectType()
export class Booking {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  shuttleId: string;

  @Field(() => Int)
  seats: number;

  @Field(() => Float)
  totalPriceUsdc: Decimal;

  @Field(() => PaymentStatus)
  paymentStatus: PaymentStatus;

  @Field({ nullable: true })
  transactionHash?: string;

  @Field(() => BookingStatus)
  status: BookingStatus;

  @Field(() => Int, { nullable: true })
  rating?: number;

  @Field({ nullable: true })
  review?: string;

  @Field(() => Reward, { nullable: true })
  reward?: Reward;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@InputType()
export class CreateBookingInput {
  @Field()
  shuttleId: string;

  @Field(() => Int, { defaultValue: 1 })
  seats: number;
}

@InputType()
export class UpdateBookingInput {
  @Field(() => BookingStatus)
  status: BookingStatus;
}

@ObjectType()
export class BookingConfirmation {
  @Field(() => Booking)
  booking: Booking;

  @Field()
  paymentUrl: string; // Solana Pay URL
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
