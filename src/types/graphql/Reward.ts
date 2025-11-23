import { ObjectType, Field, ID, Int, Float } from "type-graphql";
import { Decimal } from "@prisma/client/runtime/library";
import { Booking } from "./Booking";
import { GraphQLDecimal } from "./scalers/Decimal";
import { PaginatedResponse } from "./responses";
import { User } from "./User";

@ObjectType()
export class Reward {
  @Field(() => ID)
  id!: string;

  @Field()
  userId!: string;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field()
  bookingId!: string;

  @Field(() => Booking, { nullable: true })
  booking?: Booking;

  @Field(() => Int)
  xpEarned!: number;

  @Field(() => Int)
  co2SavedKg!: number;

  @Field(() => GraphQLDecimal, { nullable: true })
  usdcValue?: Decimal | null;

  @Field()
  claimed!: boolean;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class UserRewardsSummary {
  @Field(() => Int)
  totalXP!: number;

  @Field(() => Int)
  totalCO2XP!: number;

  @Field(() => Int)
  redeemedXP!: number;

  @Field(() => Float)
  redeemedAmount!: number;

  @Field(() => Int)
  availableXP!: number;
}

@ObjectType()
export class RedemptionResponse {
  @Field(() => Int)
  xpRedeemed!: number;

  @Field(() => Float)
  usdcAmount!: number;

  @Field()
  timestamp!: Date;
}

@ObjectType()
export class PaginatedRewardsResponse extends PaginatedResponse(Reward) {}
