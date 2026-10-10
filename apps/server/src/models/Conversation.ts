import { Schema, model, Document, Types } from 'mongoose';

export type ConversationType = 'direct' | 'group';

export interface IConversation {
  type: ConversationType;
  participants: Types.ObjectId[];
  name?: string;               // For group chats
  avatarUrl?: string;          // For group chats
  adminIds: Types.ObjectId[];  // Group admins
  lastMessage?: {
    id: string;                // ULID
    senderId: Types.ObjectId;
    content: string;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    name: { type: String, trim: true },
    avatarUrl: { type: String },
    adminIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: {
      id: { type: String },
      senderId: { type: Schema.Types.ObjectId, ref: 'User' },
      content: { type: String },
      createdAt: { type: Date },
    },
  },
  { timestamps: true }
);

// Compound index to instantly find all conversations a user belongs to, ordered by latest update
conversationSchema.index({ participants: 1, updatedAt: -1 });

export const Conversation = model<IConversation>('Conversation', conversationSchema);
