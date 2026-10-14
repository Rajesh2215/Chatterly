/**
 * All Socket.io event names and their payload shapes.
 * Shared contract between server and client.
 */


export interface ServerToClientEvents {
  'new_message': (payload: MessagePayload) => void;
  'user_typing': (payload: TypingPayload) => void;
  'user_stop_typing': (payload: TypingPayload) => void;
  'error': (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join_conversation': (conversationId: string) => void;
  'leave_conversation': (conversationId: string) => void;
  'send_message': (payload: SendMessagePayload) => void;
  'typing_start': (conversationId: string) => void;
  'typing_stop': (conversationId: string) => void;
}

// Data attached to each connected socket (set after auth)
export interface SocketData {
  userId: string;
  username: string;
  email: string;
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
