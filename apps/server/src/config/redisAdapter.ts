import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

const redisUri = process.env.REDIS_URI || "redis://127.0.0.1:6379";

// 1. General Redis client (for Auth sessions, Caching, Health checks)
export const redis = new Redis(redisUri, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
});

redis.on("connect", () => {
  console.log("✅ Redis connected (General Client)");
});

redis.on("error", (err) => {
  console.error("❌ Redis error (General Client):", err.message);
});

// 2. Dedicated Pub/Sub clients for Socket.IO horizontal scaling
export const pubClient = redis.duplicate({
  maxRetriesPerRequest: null,
});

export const subClient = redis.duplicate({
  maxRetriesPerRequest: null,
});

pubClient.on("error", (err) => {
  console.error("❌ Redis PubClient error:", err.message);
});

subClient.on("error", (err) => {
  console.error("❌ Redis SubClient error:", err.message);
});

// 3. Factory returning the Socket.IO Redis Adapter
export function getSocketRedisAdapter() {
  return createAdapter(pubClient, subClient);
}
