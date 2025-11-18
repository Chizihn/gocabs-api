import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { NFTVerificationService } from "../services/blockchain/NFTVerificationService";

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
        const access = await NFTVerificationService.hasNFTAccess(
          user.walletAddress
        );
        isNFTHolder = access.hasAccess;
      } catch (verificationError) {
        logger.warn("NFT verification failed:", verificationError);
      }
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
  walletAddress: string
): string => {
  return jwt.sign({ userId, walletAddress }, JWT_SECRET, {
    expiresIn: "7d",
  });
};
