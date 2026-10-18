// Mirror of server's socket.types.ts
// Keep these in sync if you add new events.

export interface ServerToClientEvents {
  'new_message': (payload: MessagePayload) => void;
  'user_typing': (payload: TypingPayload) => void;
  'user_stop_typing': (payload: TypingPayload) => void;
  'error': (payload: { message: string }) => void;
  'message_status': (payload: MessageStatusPayload) => void;
  'user_presence': (payload: UserPresencePayload) => void;
  'initial_presence': (onlineUserIds: string[]) => void;
}

export interface ClientToServerEvents {
  'send_message': (payload: SendMessagePayload) => void;
  'typing_start': (conversationId: string) => void;
  'typing_stop': (conversationId: string) => void;
  'message_status': (payload: MessageStatusPayload) => void
}

export interface MessagePayload {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string;
  deliveryStatus: 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  username: string;
}

export interface MessageStatusPayload {
  messageId?: string; // Optional if marking all messages in conversation
  conversationId: string;
  senderId: string;   // The original sender who should receive this update
  status: 'delivered' | 'read';
}

export interface UserPresencePayload {
  userId: string;
  status: 'online' | 'offline';
  lastSeenAt?: string;
}
