import { ObjectType, Field, ID } from "type-graphql";
import { GraphQLDecimal } from "./scalers/Decimal";
import type { Decimal } from "@prisma/client/runtime/library";

@ObjectType()
export class Reward {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  bookingId: string;

  @Field()
  xpPoints: number;

  @Field()
  co2XpPoints: number;

  @Field()
  isRedeemed: boolean;

  @Field(() => GraphQLDecimal, { nullable: true })
  redeemedAmount?: Decimal | string;

  @Field(() => Date, { nullable: true })
  redeemedAt?: Date;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class UserRewardsSummary {
  @Field()
  totalXP: number;

  @Field()
  totalCO2XP: number;

  @Field()
  redeemedXP: number;

  @Field()
  redeemedAmount: number;

  @Field()
  availableXP: number;
}

@ObjectType()
export class RedemptionResponse {
  @Field()
  xpRedeemed: number;

  @Field()
  usdcAmount: number;

  @Field()
  timestamp: Date;
}
