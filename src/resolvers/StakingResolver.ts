import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { StakingService } from "../services/blockchain/StakingService";
import {
  StakedNFT,
  StakeNFTInput,
  RevenueShareInfo,
  FractionalRevenueInfo,
  PaginatedStakedNFTsResponse,
} from "../types/graphql/Staking";
import { type Context } from "../types/Context";
import {
  BaseResponse,
  PaginationInput,
  SortInput,
} from "../types/graphql/responses";
import { GraphQLError } from "graphql";

@Resolver()
export class StakingResolver {
  @Authorized("NFT_HOLDER")
  @Mutation(() => StakedNFT)
  async stakeNFT(
    @Arg("input") input: StakeNFTInput,
    @Ctx() ctx: Context
  ): Promise<StakedNFT> {
    try {
      const stake = await StakingService.stakeNFT(
        ctx.userId!,
        input.tokenMint,
        input.stakeType,
        input.tier,
        input.shuttleId
      );
      return stake as any;
    } catch (error: any) {
      throw new GraphQLError(error.message || "Failed to stake NFT.");
    }
  }

  @Authorized("NFT_HOLDER")
  @Mutation(() => BaseResponse)
  async unstakeNFT(
    @Arg("tokenMint") tokenMint: string,
    @Ctx() ctx: Context
  ): Promise<BaseResponse> {
    return StakingService.unstakeNFT(ctx.userId!, tokenMint);
  }

  @Authorized("NFT_HOLDER")
  @Query(() => PaginatedStakedNFTsResponse)
  async myStakedNFTs(
    @Ctx() ctx: Context,
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput
  ): Promise<PaginatedStakedNFTsResponse> {
    const result = await StakingService.getUserStakedNFTs(
      ctx.userId!,
      pagination,
      sort
    );
    // The 'as any' is a temporary workaround for a known TypeGraphQL/Prisma typing complexity.
    return result as any;
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
