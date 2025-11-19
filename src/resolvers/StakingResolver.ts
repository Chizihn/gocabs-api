import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { StakingService } from "../services/blockchain/StakingService";
import {
  StakedNFT,
  StakeNFTInput,
  RevenueShareInfo,
  FractionalRevenueInfo,
} from "../types/graphql/Staking";
import { type Context } from "../types/Context";

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
      input.tokenMint,
      input.stakeType,
      input.tier,
      input.shuttleId
    ) as unknown as StakedNFT;
  }

  @Authorized("NFT_HOLDER")
  @Mutation(() => Boolean)
  async unstakeNFT(
    @Arg("tokenMint") tokenMint: string,
    @Ctx() ctx: Context
  ): Promise<boolean> {
    return StakingService.unstakeNFT(ctx.userId!, tokenMint);
  }

  @Authorized("NFT_HOLDER")
  @Query(() => [StakedNFT])
  async myStakedNFTs(@Ctx() ctx: Context): Promise<StakedNFT[]> {
    return StakingService.getUserStakedNFTs(
      ctx.userId!
    ) as unknown as StakedNFT[];
  }

  @Authorized("ADMIN")
  @Query(() => RevenueShareInfo)
  async revenueShareInfo(
    @Arg("period", { defaultValue: "monthly" }) period: "monthly" | "weekly"
  ): Promise<RevenueShareInfo> {
    return StakingService.calculateRevenueShare(
      period
    ) as unknown as RevenueShareInfo;
  }

  @Authorized("ADMIN")
  @Query(() => FractionalRevenueInfo)
  async fractionalRevenueInfo(
    @Arg("shuttleId") shuttleId: string,
    @Arg("period", { defaultValue: "monthly" }) period: "monthly" | "weekly"
  ): Promise<FractionalRevenueInfo> {
    return StakingService.calculateFractionalOwnershipRevenue(
      shuttleId,
      period
    ) as unknown as FractionalRevenueInfo;
  }
}
