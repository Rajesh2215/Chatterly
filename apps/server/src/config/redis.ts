import Redis from 'ioredis';

const redisUri = process.env.REDIS_URI || 'redis://127.0.0.1:6379';

export const redis = new Redis(redisUri, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});
