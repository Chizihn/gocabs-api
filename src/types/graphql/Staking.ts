import {
  ObjectType,
  Field,
  ID,
  InputType,
  registerEnumType,
  Int,
} from "type-graphql";
import { StakeType, StakingTier } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { GraphQLDecimal } from "./scalers/Decimal";
import { Payout } from "./Payout";
import { PaginatedResponse } from "./responses";

registerEnumType(StakeType, {
  name: "StakeType",
});

registerEnumType(StakingTier, {
  name: "StakingTier",
});

@ObjectType()
export class StakedNFT {
  @Field(() => ID)
  id!: string;

  @Field()
  walletAddress!: string;

  @Field()
  tokenMint!: string;

  @Field(() => StakeType)
  stakeType!: StakeType;

  @Field({ nullable: true })
  shuttleId?: string;

  @Field(() => StakingTier)
  tier!: StakingTier;

  @Field()
  isActive!: boolean;

  @Field()
  stakedAt!: Date;

  @Field({ nullable: true })
  unstakedAt?: Date;

  @Field(() => GraphQLDecimal)
  totalEarnings!: Decimal;

  @Field({ nullable: true })
  lastPayoutAt?: Date;

  @Field(() => [Payout], { nullable: true })
  payouts?: Payout[];
}

@ObjectType()
export class StakingStats {
  @Field(() => GraphQLDecimal)
  totalEarned!: Decimal;

  @Field(() => Int)
  totalStaked!: number;

  @Field(() => [StakedNFT])
  stakedNFTs!: StakedNFT[];
}

@ObjectType()
export class RevenueShareInfo {
  @Field()
  period!: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field(() => GraphQLDecimal)
  totalRevenue!: Decimal;

  @Field(() => GraphQLDecimal)
  distributableRevenue!: Decimal;

  @Field(() => GraphQLDecimal)
  tier1PerNFT!: Decimal;

  @Field(() => GraphQLDecimal)
  tier2PerNFT!: Decimal;

  @Field(() => Int)
  tier1Stakes!: number;

  @Field(() => Int)
  tier2Stakes!: number;
}

@ObjectType()
export class FractionalRevenueInfo {
  @Field()
  period!: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field(() => GraphQLDecimal)
  totalRevenue!: Decimal;

  @Field(() => GraphQLDecimal)
  perNFT!: Decimal;

  @Field(() => Int)
  stakes!: number;
}

@InputType()
export class StakeNFTInput {
  @Field()
  tokenMint!: string;

  @Field(() => StakeType)
  stakeType!: StakeType;

  @Field(() => StakingTier)
  tier!: StakingTier;

  @Field({ nullable: true })
  shuttleId?: string;
}

@InputType()
export class UnstakeNFTInput {
  @Field()
  tokenMint!: string;
}

@ObjectType()
export class PaginatedStakedNFTsResponse extends PaginatedResponse(StakedNFT) {}
