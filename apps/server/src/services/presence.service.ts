import { redis } from '../config/redisAdapter.js';

const PRESENCE_KEY = 'presence:connections';

export class PresenceService {
  /**
   * Atomically increments active socket count for a user in Redis.
   * Returns the new count across all servers.
   * If new count === 1, the user just came online!
   */
  async userConnected(userId: string): Promise<number> {
    return await redis.hincrby(PRESENCE_KEY, userId, 1);
  }

  /**
   * Atomically decrements active socket count for a user in Redis.
   * If remaining count <= 0, deletes from the hash.
   * Returns remaining count. If <= 0, user went completely offline!
   */
  async userDisconnected(userId: string): Promise<number> {
    const remaining = await redis.hincrby(PRESENCE_KEY, userId, -1);
    if (remaining <= 0) {
      await redis.hdel(PRESENCE_KEY, userId);
      return 0;
    }
    return remaining;
  }

  /**
   * Checks which contact IDs are currently online across all servers.
   * HMGET fetches all in a single O(N) round-trip (<0.2ms).
   */
  async getOnlineContacts(contactIds: string[]): Promise<string[]> {
    if (!contactIds || contactIds.length === 0) return [];

    const counts = await redis.hmget(PRESENCE_KEY, ...contactIds);

    const onlineIds: string[] = [];
    contactIds.forEach((id, index) => {
      const count = parseInt(counts[index] || '0', 10);
      if (count > 0) {
        onlineIds.push(id);
      }
    });

    return onlineIds;
  }
}

export const presenceService = new PresenceService();
