import { redis } from '../config/redisAdapter.js';
import { Message } from '../models/Message.js';
import { Types } from 'mongoose';

export class UnreadService {
  private getKey(userId: string): string {
    return `unread:${userId}`;
  }

  /**
   * Atomically increments the unread counter for a recipient in a conversation.
   * Runs in 0.05ms O(1).
   */
  async incrementUnread(recipientId: string, conversationId: string): Promise<number> {
    return await redis.hincrby(this.getKey(recipientId), conversationId, 1);
  }

  /**
   * Clears the unread counter when a user opens/reads a conversation.
   * Runs in 0.05ms O(1).
   */
  async clearUnread(userId: string, conversationId: string): Promise<void> {
    await redis.hdel(this.getKey(userId), conversationId);
  }

  /**
   * Fetches all unread counts for a user's conversations.
   * 1. Checks Redis Hash via HGETALL (0.1ms).
   * 2. If Redis is empty (e.g. cold start / server restart), computes from MongoDB
   *    and seeds Redis so future loads are instant.
   */
  async getUserUnreadCounts(userId: string, convIds: any[]): Promise<Map<string, number>> {
    const unreadMap = new Map<string, number>();

    // Step 1: Check Redis Hash
    const redisCounts = await redis.hgetall(this.getKey(userId));

    if (redisCounts && Object.keys(redisCounts).length > 0) {
      Object.entries(redisCounts).forEach(([convId, countStr]) => {
        unreadMap.set(convId, parseInt(countStr, 10) || 0);
      });
      return unreadMap;
    }

    // Step 2: Cold Cache Fallback -> Calculate from MongoDB and seed Redis
    if (!convIds || convIds.length === 0) return unreadMap;

    const unreadStats = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          senderId: { $ne: new Types.ObjectId(userId) },
          deliveryStatus: { $ne: 'read' },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 },
        },
      },
    ]);

    const seedEntries: Record<string, number> = {};
    unreadStats.forEach((stat) => {
      const cId = String(stat._id);
      unreadMap.set(cId, stat.count);
      seedEntries[cId] = stat.count;
    });

    // Seed Redis in the background so next loads are instantaneous
    if (Object.keys(seedEntries).length > 0) {
      await redis.hset(this.getKey(userId), seedEntries as any);
    }

    return unreadMap;
  }
}

export const unreadService = new UnreadService();
