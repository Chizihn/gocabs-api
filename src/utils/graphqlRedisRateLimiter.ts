import { MiddlewareFn } from "type-graphql";
import { Context } from "../types/Context";
import { redisClient } from "../config/redis";

type KeyGenerator = (context: Context, operation: string) => string;

/**
 * A flexible rate limiter for TypeGraphQL resolvers that uses Redis.
 * It can limit operations based on IP, user ID, or other context information.
 */
export class GraphQLRedisRateLimiter {
  private readonly prefix: string;
  private readonly windowMs: number;
  private readonly max: number;
  private readonly keyGenerator: KeyGenerator;

  constructor(
    prefix: string,
    windowMs: number,
    max: number,
    keyGenerator?: KeyGenerator
  ) {
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.max = max;

    // Default key generator uses IP address.
    this.keyGenerator =
      keyGenerator ||
      ((ctx, operation) => `${prefix}_${operation}_${ctx.req?.ip}`);
  }

  /**
   * Creates a TypeGraphQL middleware function to enforce the rate limit.
   */
public getMiddleware(): MiddlewareFn<Context> {
  return async ({ context, info }, next) => {
    const operationName = info.fieldName;
    const key = this.keyGenerator(context, operationName);

    const multi = redisClient.multi();
    multi.incr(key);
    multi.pttl(key); // Get remaining TTL

    const replies = await multi.exec();

    if (!replies) {
      throw new Error("Redis rate limiter failed");
    }

    const [[, count], [, ttl]] = replies as [[null, number], [null, number]];

    // If key didn't exist before INCR, count will be 1 and ttl will be -2
    if (ttl === -2) {
      // Key is brand new → set expiry
      await redisClient.expire(key, Math.ceil(this.windowMs / 1000));
    }

    if (count > this.max) {
      const retryAfter = ttl > 0 ? Math.ceil(ttl / 1000) : 60;
      context.res.setHeader("Retry-After", retryAfter.toString());
      throw new Error("Too many requests, please try again later.");
    }

    return next();
  };
}
}
