import { redis } from '../config/redisAdapter.js';

// The Lua script executed directly inside Redis's C engine in <0.05ms

const TOKEN_BUCKET_LUA = `
  -- 1. Read arguments passed from Node.js
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refillRatePerMs = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local cost = tonumber(ARGV[4])

  -- 2. Fetch the current state stored in Redis Hash
  local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local currentTokens = tonumber(data[1])
  local lastRefill = tonumber(data[2])

  -- 3. If user has no records in Redis, initialize a full bucket
  if not currentTokens then
    currentTokens = capacity
    lastRefill = now
  else
    local deltaMs = math.max(0, now - lastRefill)
    currentTokens = math.min(capacity, currentTokens + (deltaMs * refillRatePerMs))
    lastRefill = now
  end

  -- 4. Check if the user has enough tokens to send the message
  if currentTokens >= cost then
    currentTokens = currentTokens - cost
    redis.call('HMSET', key, 'tokens', currentTokens, 'lastRefill', lastRefill)
    redis.call('EXPIRE', key, 60)
    return { 1, math.floor(currentTokens) }
  else
    redis.call('HMSET', key, 'tokens', currentTokens, 'lastRefill', lastRefill)
    redis.call('EXPIRE', key, 60)
    return { 0, math.floor(currentTokens) }
  end
`;


export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
}

export class RateLimiterService {
  /**
   * Checks if an action is allowed under the Token Bucket rate limit.
   * Default: Burst capacity of 10 messages, refilling at 2 messages per second.
   */
  async consume(
    userId: string,
    capacity: number = 10,
    refillPerSecond: number = 2,
    cost: number = 1
  ): Promise<RateLimitResult> {
    const key = `ratelimit:user:${userId}`;
    const refillRatePerMs = refillPerSecond / 1000;
    const now = Date.now();

    // redis.eval executes the Lua script atomically in Redis
    const result = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1, // Number of KEYS
      key, // KEYS[1]
      capacity, // ARGV[1]
      refillRatePerMs, // ARGV[2]
      now, // ARGV[3]
      cost // ARGV[4]
    )) as [number, number];

    const allowed = result[0] === 1;
    const remainingTokens = result[1];

    return { allowed, remainingTokens };
  }
}

export const rateLimiter = new RateLimiterService();
