// src/config/pubsub.ts
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { redisClient } from './redis';

export const pubSub = new RedisPubSub({
  publisher: redisClient,
  subscriber: redisClient.duplicate(),
});