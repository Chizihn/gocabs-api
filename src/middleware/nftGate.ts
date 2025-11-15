import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../utils/logger";

type ResponseOrVoid = Response | void;

export const nftGateMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<ResponseOrVoid> => {
  try {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
        code: "UNAUTHENTICATED",
      });
    }

    // Check if user is NFT holder
    if (!user.isNFTHolder) {
      return res.status(403).json({
        error: "NFT required to access this feature",
        code: "NFT_REQUIRED",
        message: "You need a GoCabs Pass NFT to access this feature",
      });
    }

    return next();
  } catch (error) {
    logger.error("NFT gate middleware error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
