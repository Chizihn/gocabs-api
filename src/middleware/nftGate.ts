import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../utils/logger";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { prisma } from "../config/database";

type ResponseOrVoid = Response | void;

/**
 * Middleware to check if user has NFT access (either owns or has staked NFTs)
 * This should be used after the auth middleware
 */
export const nftGateMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<ResponseOrVoid> => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required",
        code: "UNAUTHENTICATED",
      });
    }

    // Get user with staked NFTs
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { stakedNFTs: true }
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        error: "No wallet address found for user",
        code: "NO_WALLET_ADDRESS",
      });
    }

    // Check NFT access (owns or has staked NFTs from GoCabs collection)
    const { hasAccess, reason } = await NFTVerificationService.hasNFTAccess(user.walletAddress);
    
    if (!hasAccess) {
      return res.status(403).json({
        error: "GoCabs NFT Required",
        code: "GOCABS_NFT_REQUIRED",
        message: "This feature requires owning or staking a GoCabs NFT",
        details: {
          requiredCollection: process.env.NFT_COLLECTION_ADDRESS,
          userWallet: user.walletAddress,
          ownsNFT: false,
          hasStakedNFT: false,
          reason: 'no_gocabs_nft'
        },
        action: {
          title: "Get GoCabs NFT",
          url: "https://gocabs.io/nft", // Update this with your actual NFT minting URL
          description: "Purchase and mint a GoCabs NFT to unlock this feature"
        }
      });
    }

    // Add NFT access details to the request for use in the route handler if needed
    (req as any).nftAccess = {
      hasAccess: true,
      reason,
      ownsNFT: reason === 'owns_nft',
      hasStakedNFT: reason === 'has_staked',
      walletAddress: user.walletAddress
    };

    return next();
  } catch (error) {
    logger.error("NFT gate middleware error:", error);
    return res.status(500).json({ 
      error: "Failed to verify NFT access",
      code: "NFT_VERIFICATION_ERROR"
    });
  }
};

/**
 * Middleware to check if user has staked a specific NFT
 * @param requiredTokenMint - The mint address of the required NFT
 */
export const specificNftStakeMiddleware = (requiredTokenMint: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<ResponseOrVoid> => {
    try {
      const userId = (req as any).userId;

      if (!userId) {
        return res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHENTICATED",
        });
      }

      // Check if the user has staked the specific NFT
      const stakedNFT = await prisma.stakedNFT.findFirst({
        where: {
          user: {
            id: userId
          },
          tokenMint: requiredTokenMint
        }
      });

      if (!stakedNFT) {
        return res.status(403).json({
          error: "Specific staked NFT required",
          code: "SPECIFIC_NFT_STAKE_REQUIRED",
          message: `You need to stake the NFT with mint address ${requiredTokenMint} to access this feature`,
          requiredTokenMint
        });
      }

      return next();
    } catch (error) {
      logger.error("Specific NFT stake middleware error:", error);
      return res.status(500).json({ 
        error: "Failed to verify staked NFT",
        code: "STAKED_NFT_VERIFICATION_ERROR"
      });
    }
  };
};
