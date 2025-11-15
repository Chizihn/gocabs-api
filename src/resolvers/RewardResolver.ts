import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { RewardCalculationService } from "../services/rewards/RewardCalculationService";
import {
  Reward,
  UserRewardsSummary,
  RedemptionResponse,
} from "../types/graphql/Reward";
import { Context } from "../types/Context";
import { prisma } from "../config/database";

@Resolver()
export class RewardResolver {
  @Authorized()
  @Query(() => UserRewardsSummary)
  async myRewards(@Ctx() ctx: Context): Promise<UserRewardsSummary> {
    return RewardCalculationService.getUserTotalRewards(ctx.userId!) as any;
  }

  @Authorized()
  @Query(() => [Reward])
  async myRewardHistory(@Ctx() ctx: Context): Promise<Reward[]> {
    return prisma.reward.findMany({
      where: { userId: ctx.userId! },
      orderBy: { createdAt: "desc" },
    }) as any;
  }

  @Authorized("NFT_HOLDER")
  @Mutation(() => RedemptionResponse)
  async redeemRewards(
    @Arg("xpAmount") xpAmount: number,
    @Ctx() ctx: Context
  ): Promise<RedemptionResponse> {
    return RewardCalculationService.redeemRewards(ctx.userId!, xpAmount) as any;
  }
}

