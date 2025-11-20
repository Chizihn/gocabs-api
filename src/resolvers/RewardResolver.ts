import { Resolver, Query, Mutation, Arg, Ctx, Authorized } from "type-graphql";
import { RewardCalculationService } from "../services/rewards/RewardCalculationService";
import {
  Reward,
  UserRewardsSummary,
  RedemptionResponse,
  PaginatedRewardsResponse,
} from "../types/graphql/Reward";
import { type Context } from "../types/Context";
import { prisma } from "../config/database";
import { PaginationInput, SortInput } from "../types/graphql/responses";

@Resolver()
export class RewardResolver {
  @Authorized()
  @Query(() => UserRewardsSummary)
  async myRewards(@Ctx() ctx: Context): Promise<UserRewardsSummary> {
    return RewardCalculationService.getUserTotalRewards(ctx.userId!) as any;
  }

  @Authorized()
  @Query(() => PaginatedRewardsResponse)
  async myRewardHistory(
    @Ctx() ctx: Context,
    @Arg("pagination") pagination: PaginationInput,
    @Arg("sort", { nullable: true }) sort?: SortInput
  ): Promise<PaginatedRewardsResponse> {
    const where = { userId: ctx.userId! };
    const { page, limit } = pagination;
    const orderBy = sort
      ? { [sort.field]: sort.order }
      : { createdAt: "desc" as const };

    const [items, totalItems] = await prisma.$transaction([
      prisma.reward.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
      }),
      prisma.reward.count({ where }),
    ]);

    return {
      items: items as any,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
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
