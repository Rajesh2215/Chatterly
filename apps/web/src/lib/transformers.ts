import {
  ApiConversation,
  ApiMessage,
  Conversation,
  Message,
  UserProfile,
} from '@/types/chat';

export function formatMessageTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatConversationTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function transformApiMessageToUi(apiMsg: ApiMessage): Message {
  return {
    id: apiMsg._id,
    senderId: String(apiMsg.senderId),
    content: apiMsg.content,
    timestamp: formatMessageTime(apiMsg.createdAt),
    status: apiMsg.deliveryStatus || 'sent',
    createdAt: apiMsg.createdAt,
  };
}

export function transformApiConversationToUi(
  apiConv: ApiConversation,
  currentUserId: string,
  existingMessages: Message[] = []
): Conversation {
  // Identify the peer participant
  const peerUser =
    apiConv.participants.find((p) => String(p._id) !== currentUserId) ||
    apiConv.participants[0] || {
      _id: 'unknown',
      username: 'User',
      displayName: 'Unknown User',
    };

  const peer: UserProfile = {
    id: String(peerUser._id),
    name: peerUser.username,
    displayName: peerUser.displayName || peerUser.username,
    avatarUrl:
      peerUser.avatarUrl ||
      (peerUser.username === 'alice'
        ? 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80'
        : peerUser.username === 'bob'
        ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
        : ''),
    status: 'online',
    lastSeen: peerUser.lastSeenAt ? formatConversationTime(peerUser.lastSeenAt) : undefined,
    customStatus: peerUser.statusText || 'Available',
  };

  const senderId =
    typeof apiConv.lastMessage?.senderId === 'object' && apiConv.lastMessage?.senderId !== null
      ? String(apiConv.lastMessage.senderId._id)
      : String(apiConv.lastMessage?.senderId || '');

  return {
    id: String(apiConv._id),
    type: apiConv.type,
    peer,
    lastMessage: apiConv.lastMessage
      ? {
          id: apiConv.lastMessage.id,
          content: apiConv.lastMessage.content,
          timestamp: formatConversationTime(apiConv.lastMessage.createdAt),
          senderId,
          status: 'sent',
        }
      : undefined,
    unreadCount: 0,
    messages: existingMessages,
    hasOlderMessages: false,
    nextCursor: null,
  };
}
