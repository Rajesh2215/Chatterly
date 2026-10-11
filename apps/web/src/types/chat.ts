export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
}

export interface UserProfile {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
  customStatus?: string;
}

export interface Conversation {
  id: string;
  peer: UserProfile;
  lastMessage?: {
    content: string;
    timestamp: string;
    status?: MessageStatus;
    senderId: string;
  };
  unreadCount: number;
  messages: Message[];
  hasOlderMessages?: boolean;
}

export type ThemeMode = 'dark' | 'light';
