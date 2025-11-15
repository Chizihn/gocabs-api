import {
  ObjectType,
  Field,
  ID,
  InputType,
  GraphQLISODateTime,
  Float,
  Int,
} from "type-graphql";
import { StakingTier } from "@prisma/client";
import { GraphQLDecimal } from "./scalers/Decimal";
import type { Decimal } from "@prisma/client/runtime/library";

@ObjectType()
export class StakedNFT {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field(() => String)
  nftMintAddress: string;

  @Field(() => StakingTier)
  stakingTier: StakingTier;

  @Field(() => String, { nullable: true })
  shuttleId?: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  stakedAt: Date;

  @Field(() => Date, { nullable: true })
  unstakedAt?: Date;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => GraphQLDecimal)
  totalEarnings: Decimal | string;

  @Field(() => Date, { nullable: true })
  lastPayoutAt?: Date;
}

@InputType()
export class StakeNFTInput {
  @Field(() => String)
  nftMintAddress: string;

  @Field(() => String, { nullable: true })
  shuttleId?: string;
}

@ObjectType()
export class RevenueShareInfo {
  @Field(() => GraphQLDecimal)
  totalRevenue: Decimal | string;

  @Field(() => GraphQLDecimal)
  platformFee: Decimal | string;

  @Field(() => GraphQLDecimal)
  distributableRevenue: Decimal | string;

  @Field(() => Int)
  tier1PerNFT: number;

  @Field(() => Int)
  tier2PerNFT: number;

  @Field(() => Int)
  tier1Stakes: number;

  @Field(() => Int)
  tier2Stakes: number;

  @Field(() => String)
  period: string;

  @Field(() => GraphQLISODateTime)
  startDate: Date;

  @Field(() => GraphQLISODateTime)
  endDate: Date;
}
