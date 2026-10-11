import { Types } from 'mongoose';
import { Conversation, IConversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { IMessage, Message } from '../models/Message.js';

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
      participants: { $all: [currentUserId, participantId], $size: 2 },
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
}

export const conversationService = new ConversationService();
