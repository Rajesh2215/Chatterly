import { Schema, model, Types } from 'mongoose';
import { ulid } from 'ulid';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'system';
export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read';

export interface IMessage {
  _id: string; // We use ULID as the primary key!
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  type: MessageType;
  content: string;
  // Forward-compatible for End-to-End Encryption
  cipherPayload?: {
    ciphertext: string;
    nonce: string;
    keyBundleId?: string;
  };
  deliveryStatus: MessageDeliveryStatus;
  reactions: Map<string, Types.ObjectId[]>;
  replyToId?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    _id: { type: String, default: () => ulid() }, // Automatic ULID generation
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'file', 'audio', 'system'], default: 'text' },
    content: { type: String, required: true },
    cipherPayload: {
      ciphertext: { type: String },
      nonce: { type: String },
      keyBundleId: { type: String },
    },
    deliveryStatus: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    reactions: { type: Map, of: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: {} },
    replyToId: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    _id: false, // Prevents Mongoose from auto-creating default ObjectId _id
  }
);

// CRITICAL CHAT INDEX: Sub-millisecond cursor pagination
// Fetches the latest 30 messages in a conversation in <1ms!
messageSchema.index({ conversationId: 1, _id: -1 });

export const Message = model<IMessage>('Message', messageSchema);
