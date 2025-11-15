import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { Request } from "express";

export interface User {
  id: string;
  walletAddress: string;
  role: string;
  isNFTHolder: boolean;
  nftTokens: string[];
}

export interface Context {
  req: Request;
  user: User | null;
  userId: string | null;
  prisma: PrismaClient;
  redisClient: Redis;
}
