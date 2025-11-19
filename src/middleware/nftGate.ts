import { MiddlewareFn } from "type-graphql";
import { GraphQLError } from "graphql";
import { Context } from "../types/Context";
import { logger } from "../utils/logger";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { prisma } from "../config/database";

/**
 * GraphQL middleware to check if user has NFT access (either owns or has staked NFTs).
 * This should be used after the auth middleware populates context.user.
 */
export const NFTGate: MiddlewareFn<Context> = async ({ context }, next) => {
  try {
    const userId = context.userId;

    if (!userId) {
      throw new GraphQLError("Authentication required", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new GraphQLError("User not found", {
        extensions: { code: "USER_NOT_FOUND" },
      });
    }

    if (!user.walletAddress) {
      throw new GraphQLError("No wallet address found for user", {
        extensions: { code: "NO_WALLET_ADDRESS" },
      });
    }

    const { hasAccess } = await NFTVerificationService.hasNFTAccess(user.walletAddress);
    
    if (!hasAccess) {
      throw new GraphQLError("GoCabs NFT Required. This feature requires owning or staking a GoCabs NFT.", {
        extensions: { 
            code: "GOCABS_NFT_REQUIRED",
            action: {
                title: "Get GoCabs NFT",
                url: "https://gocabs.io/nft",
                description: "Purchase and mint a GoCabs NFT to unlock this feature"
            }
        },
      });
    }

    return next();
  } catch (error) {
    logger.error("NFT gate middleware error:", error);
    if (error instanceof GraphQLError) {
        throw error;
    }
    throw new GraphQLError("Failed to verify NFT access", {
        extensions: { code: "NFT_VERIFICATION_ERROR" }
    });
  }
};

/**
 * GraphQL middleware to check if user has staked a specific NFT.
 * @param requiredTokenMint - The mint address of the required NFT.
 */
export const SpecificNFTStake = (requiredTokenMint: string): MiddlewareFn<Context> => {
    return async ({ context }, next) => {
        try {
            const userId = context.userId;

            if (!userId) {
                throw new GraphQLError("Authentication required", {
                    extensions: { code: "UNAUTHENTICATED" },
                });
            }

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user || !user.walletAddress) {
                 throw new GraphQLError("User or wallet address not found", {
                    extensions: { code: "USER_NOT_FOUND" },
                });
            }

            const stakedNFT = await prisma.stakedNFT.findFirst({
                where: {
                    walletAddress: user.walletAddress,
                    tokenMint: requiredTokenMint,
                    isActive: true
                }
            });

            if (!stakedNFT) {
                throw new GraphQLError(`You need to stake the NFT with mint address ${requiredTokenMint} to access this feature`, {
                    extensions: { 
                        code: "SPECIFIC_NFT_STAKE_REQUIRED",
                        requiredTokenMint
                    },
                });
            }

            return next();
        } catch (error) {
            logger.error("Specific NFT stake middleware error:", error);
            if (error instanceof GraphQLError) {
                throw error;
            }
            throw new GraphQLError("Failed to verify staked NFT", {
                extensions: { code: "STAKED_NFT_VERIFICATION_ERROR" }
            });
        }
    };
};