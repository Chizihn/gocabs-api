import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { prisma } from "../config/database";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { generateToken } from "../middleware/auth";

/**
 * REST API endpoint for refreshing the user's authentication token.
 * This is useful after an event that changes their status, like minting an NFT.
 * POST /api/auth/refresh-token
 * (Requires authentication)
 */
export const refreshTokenHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.walletAddress) {
      return res.status(404).json({ error: "User or wallet not found" });
    }

    // Perform a live, non-cached check for NFT ownership
    const { hasAccess } = await NFTVerificationService.hasNFTAccess(
      user.walletAddress
    );

    // Generate a new token with the updated status
    const newAuthToken = generateToken(
      user.id,
      user.role,
      user.walletAddress,
      hasAccess
    );

    logger.info(
      `[Auth] Refreshed token for user ${userId}. NFT status: ${hasAccess}`
    );
    return res.status(200).json({ newAuthToken });
  } catch (error: any) {
    logger.error("[Auth] Error refreshing token:", error);
    return res
      .status(500)
      .json({ error: "Failed to refresh token", message: error.message });
  }
};
