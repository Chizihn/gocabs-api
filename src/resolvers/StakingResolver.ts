import { Resolver, Query, Mutation, Arg, Ctx, Authorized, registerEnumType } from "type-graphql";
import { StakingService } from "../services/blockchain/StakingService";
import {
  StakedNFT,
  StakeNFTInput,
  RevenueShareInfo,
} from "../types/graphql/Staking";
import { Context } from "../types/Context";
import { StakingTier } from "@prisma/client";

// StakingTier enum
  registerEnumType(StakingTier, {
    name: "StakingTier",
    description: "Tier levels for staking rewards",
    valuesConfig: {
      TIER_1: { description: "1 NFT - 25% share of rewards" },
      TIER_2: { description: "3+ NFTs - 40% share of rewards" },
    },
  });

@Resolver()
export class StakingResolver {
  @Authorized("NFT_HOLDER")
  @Mutation(() => StakedNFT)
  async stakeNFT(
    @Arg("input") input: StakeNFTInput,
    @Ctx() ctx: Context
  ): Promise<StakedNFT> {
    return StakingService.stakeNFT(
      ctx.userId!,
      input.nftMintAddress,
      input.shuttleId
    ) as any;
  }

  @Authorized("NFT_HOLDER")
  @Mutation(() => Boolean)
  async unstakeNFT(
    @Arg("stakedNFTId") stakedNFTId: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    return StakingService.unstakeNFT(ctx.userId!, stakedNFTId);
  }

  @Authorized("NFT_HOLDER")
  @Query(() => [StakedNFT])
  async myStakedNFTs(@Ctx() ctx: Context): Promise<StakedNFT[]> {
    return StakingService.getUserStakedNFTs(ctx.userId!) as any;
  }

  @Authorized("ADMIN")
  @Query(() => RevenueShareInfo)
  async revenueShareInfo(
    @Arg("period", { defaultValue: "monthly" }) period: "monthly" | "weekly"
  ): Promise<RevenueShareInfo> {
    return StakingService.calculateRevenueShare(period) as any;
  }
}
