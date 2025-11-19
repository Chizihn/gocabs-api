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
    logger.info("Token: ", token);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

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
        const access = await NFTVerificationService.hasNFTAccess(
          user.walletAddress
        );
        isNFTHolder = access.hasAccess;
        logger.info("NFT verification result:", isNFTHolder);
      } catch (verificationError) {
        logger.warn("NFT verification failed:", verificationError);
      }
    } else {
      logger.info("No wallet address found for user, skipping NFT verification");
    }

    (req as any).user = {
      ...user,
      isNFTHolder,
    };
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
  identifier?: string,
): string => {
  return jwt.sign({ userId, role, identifier }, JWT_SECRET, {
    expiresIn: "7d",
  });
};
