import { Types } from 'mongoose';
import { Conversation, IConversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { IMessage, Message } from '../models/Message.js';
import { unreadService } from './unread.service.js';

export interface DirectConversationResult {
  conversation: IConversation;
  isNew: boolean;
}

export class ConversationService {

  async getOrCreateDirectConversation(
    currentUserId: string,
    participantId: string
  ): Promise<DirectConversationResult> {
    if (currentUserId === participantId) {
      throw new Error('Cannot start a direct conversation with yourself');
    }

    const [user1, user2] = await Promise.all([
      User.findById(currentUserId),
      User.findById(participantId),
    ]);

    if (!user1 || !user2) {
      throw new Error('One or both users not found');
    }

    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: {
        $all: [new Types.ObjectId(currentUserId), new Types.ObjectId(participantId)],
        $size: 2,
      },
    }).populate('participants', 'username displayName avatarUrl statusText lastSeenAt');

    let isNew = false;

    if (!conversation) {
      const newConv = await Conversation.create({
        type: 'direct',
        participants: [new Types.ObjectId(currentUserId), new Types.ObjectId(participantId)],
        adminIds: [new Types.ObjectId(currentUserId)],
      });

      conversation = await Conversation.findById(newConv._id)
        .populate('participants', 'username displayName avatarUrl statusText lastSeenAt');

      isNew = true;
    }

    return {
      conversation: conversation!,
      isNew,
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<IMessage> {

    if (!content || !content.trim()) {
      throw new Error('Message content cannot be empty');
    }

    const conversation = await Conversation.findById(conversationId)

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const isParticipant = conversation.participants.some((p) => p.toString() === senderId)
    if (!isParticipant) {
      throw new Error('Sender is not a participant in this conversation');
    }

    const message = await Message.create({
      conversationId,
      senderId: new Types.ObjectId(senderId),
      content: content.trim(),
      deliveryStatus: "sent"
    })

    conversation.lastMessage = {
      id: message._id,
      senderId: new Types.ObjectId(senderId),
      content: content.trim(),
      createdAt: message.createdAt
    }

    await conversation.save()

    return message
  }

  async getMessages(params: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  }) {

    const { conversationId, cursor } = params;
    const limit = Math.min(Math.max(params.limit || 20, 1), 50); // Default 20, max 50

    // Build the query:
    const query: any = { conversationId };
    if (cursor) {
      query._id = { $lt: cursor }; // ULIDs older than the cursor
    }

    // Fetch limit + 1 to check if there are more older messages
    const messages = await Message.find(query).sort({ _id: -1 }).limit(limit + 1).lean()
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra (+1) message used for the hasMore check
    }

    // The oldest message in this batch becomes the nextCursor for scrolling up
    const nextCursor = hasMore && messages.length > 0 ? messages[messages.length - 1]._id : null;

    // Reverse so messages are in natural top-to-bottom chronological reading order for the client
    messages.reverse();
    return {
      messages,
      nextCursor,
      hasMore,
    };
  }

  async getUserConversations(userId: string): Promise<any[]> {
    if (!userId) {
      throw new Error('userId is required');
    }

    const conversations = await Conversation.find({
      participants: new Types.ObjectId(userId),
    })
      .sort({ updatedAt: -1 }) // Most recently active conversation at the top
      .populate('participants', 'username displayName avatarUrl statusText lastSeenAt')
      .populate('lastMessage.senderId', 'username displayName')
      .lean();

    if (!conversations || conversations.length === 0) {
      return [];
    }

    const convIds = conversations.map((c) => c._id);

    // O(1) Redis Hash Lookup (<0.1ms) with cold-cache MongoDB fallback:
    const unreadMap = await unreadService.getUserUnreadCounts(userId, convIds);

    return conversations.map((conv) => ({
      ...conv,
      unreadCount: unreadMap.get(String(conv._id)) || 0,
    }));

  }

}

export const conversationService = new ConversationService();
