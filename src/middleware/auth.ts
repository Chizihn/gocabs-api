import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";
import { UserRole } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface JWTPayload {
  userId: string;
  walletAddress: string;
  isNFTHolder?: boolean; // Add isNFTHolder to the JWT payload
}

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      (req as any).user = null;
      return next();
    }

    const token = authHeader.replace("Bearer ", "");
    // logger.info("Token: ", token);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // If isNFTHolder status is in the token, we can trust it for this request.
    // The token will be re-issued on login, wallet change, or minting/staking events.
    if (decoded.isNFTHolder !== undefined) {
      (req as any).user = {
        id: decoded.userId,
        walletAddress: decoded.walletAddress,
        isNFTHolder: decoded.isNFTHolder,
      };
      (req as any).userId = decoded.userId; // Also set userId directly for GraphQL context
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        walletAddress: true,
        role: true,
      },
    });

    if (!user) {
      (req as any).user = null;
      return next();
    }

    let isNFTHolder = false;
    if (user.walletAddress) {
      try {
        logger.info("Checking NFT access for wallet:", user.walletAddress);
        // This performs a check if the token is old and doesn't have the isNFTHolder flag.
        // The result of this check will be used for the duration of this single request.
        const access = await NFTVerificationService.hasNFTAccess(
          user.walletAddress
        );
        isNFTHolder = access.hasAccess;

        logger.info(
          `NFT verification result for ${user.walletAddress}: ${isNFTHolder}`
        );
      } catch (verificationError) {
        logger.warn("NFT verification failed:", verificationError);
      }
    } else {
      logger.info(
        "No wallet address found for user, skipping NFT verification"
      );
    }

    (req as any).user = {
      ...user,
      isNFTHolder,
    };
    (req as any).userId = user.id; // Also set userId directly for GraphQL context
    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    (req as any).user = null;
    next();
  }
};

export const generateToken = (
  userId: string,
  role: UserRole,
  walletAddress: string,
  isNFTHolder: boolean = false // Add isNFTHolder to token generation
): string => {
  return jwt.sign({ userId, role, walletAddress, isNFTHolder }, JWT_SECRET, {
    expiresIn: "7d",
  });
};
