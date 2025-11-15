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
      multi.expire(key, Math.ceil(this.windowMs / 1000), "NX"); // Set expiry only if key is new
      
      // Execute the multi command and handle the response
      const replies = await multi.exec();

      if (!replies || replies.length === 0) {
        throw new Error("Failed to execute rate limit check");
      }

      // The first reply is from the INCR command: [error, value]
      const firstReply = replies[0];
      
      if (firstReply instanceof Error) {
        throw new Error(`Redis error during rate limiting: ${firstReply.message}`);
      }
      
      // The result is in the second position of the reply tuple
      const count = Array.isArray(firstReply) ? firstReply[1] : firstReply;

      if (typeof count !== 'number' || count > this.max) {
        throw new Error("Too many requests, please try again later.");
      }

      return next();
    };
  }
}
