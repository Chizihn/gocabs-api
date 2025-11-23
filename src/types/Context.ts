import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { Request, Response } from "express";
import { PubSubEngine } from "graphql-subscriptions";

export interface User {
  id: string;
  walletAddress?: string | null;
  role: string;
  nftTokens?: string[];
}

export interface Context {
  req: Request;
  res: Response;
  user: User | null;
  userId: string | null;
  userRole: string | null; // Added userRole
  ownerId: string | null; // Added ownerId
  isNFTHolder?: boolean;
  prisma: PrismaClient;
  redisClient: Redis;
  pubSub: PubSubEngine;
}
