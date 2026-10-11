export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  senderId: string;
  receiverId?: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
  createdAt?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
  customStatus?: string;
}

export const CURRENT_USER: UserProfile = {
  id: '6acb3c35a3fff772fc733bd1', // Alex Rivera's real MongoDB ID
  name: 'alex_rivera',
  displayName: 'Alex Rivera',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  status: 'online',
  customStatus: 'Coding something fast with Next.js 🚀',
};

export interface Conversation {
  id: string;
  type?: string;
  peer: UserProfile;
  lastMessage?: {
    id?: string;
    content: string;
    timestamp: string;
    status?: MessageStatus;
    senderId: string;
  };
  unreadCount: number;
  messages: Message[];
  hasOlderMessages?: boolean;
  nextCursor?: string | null;
}

export type ThemeMode = 'dark' | 'light';

/* Backend API Models */
export interface ApiUser {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  statusText?: string;
  lastSeenAt?: string;
}

export interface ApiConversation {
  _id: string;
  type: 'direct' | 'group';
  participants: ApiUser[];
  lastMessage?: {
    id: string;
    senderId: string | { _id: string; username?: string; displayName?: string };
    content: string;
    createdAt: string;
  };
  updatedAt: string;
  createdAt?: string;
}

export interface ApiMessage {
  _id: string;
  conversationId?: string;
  senderId: string;
  content: string;
  deliveryStatus: 'sent' | 'delivered' | 'read';
  createdAt: string;
  updatedAt?: string;
}

export interface MessagesPaginationResponse {
  messages: ApiMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
