import { GraphQLRedisRateLimiter } from "../utils/graphqlRedisRateLimiter";

// General-purpose limiter for all incoming requests
export const generalRateLimiter = new GraphQLRedisRateLimiter(
  "general",
  15 * 60 * 1000, // 15 minutes
  1000 // 100 requests per 15 minutes
).getMiddleware();

// Limiter for queries
export const queryRateLimiter = new GraphQLRedisRateLimiter(
  "query",
  60 * 1000, // 1 minute
  50, // 50 queries per minute
  (ctx, operation) => `query_${operation}_${ctx.user?.id || ctx.req.ip}`
).getMiddleware();

// Limiter for mutations
export const mutationRateLimiter = new GraphQLRedisRateLimiter(
  "mutation",
  60 * 1000, // 1 minute
  20, // 20 mutations per minute
  (ctx, operation) => `mutation_${operation}_${ctx.user?.id || ctx.req.ip}`
).getMiddleware();

// Stricter limiter for authentication mutations
export const authRateLimiter = new GraphQLRedisRateLimiter(
  "auth",
  15 * 60 * 1000, // 15 minutes
  10, // 10 auth requests per 15 minutes
  (ctx, operation) => `auth_${operation}_${ctx.req.ip}` // Use IP for auth (before user is authenticated)
).getMiddleware();

// Limiter for computationally expensive or sensitive operations
export const sensitiveOperationRateLimiter = new GraphQLRedisRateLimiter(
  "sensitive",
  5 * 60 * 1000, // 5 minutes
  5, // 5 sensitive operations per 5 minutes
  (ctx, operation) => `sensitive_${operation}_${ctx.user?.id}` // Must be authenticated
).getMiddleware();

// Limiter for file uploads
export const uploadRateLimiter = new GraphQLRedisRateLimiter(
  "upload",
  60 * 60 * 1000, // 1 hour
  20, // 20 uploads per hour
  (ctx, operation) => `upload_${ctx.user?.id || ctx.req.ip}`
).getMiddleware();

// Specific limiter for a map search feature to prevent abuse
export const mapSearchRateLimiter = new GraphQLRedisRateLimiter(
  "map_search",
  30 * 1000, // 30 seconds
  1, // 1 request per 30 seconds
  (ctx, operation) => `map_search_${ctx.user?.id || ctx.req.ip}`
).getMiddleware();
