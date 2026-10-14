import { apiClient } from './client';
import {
  ApiConversation,
  ApiMessage,
  ApiResponse,
  MessagesPaginationResponse,
} from '@/types/chat';

export async function getConversations(userId: string): Promise<ApiConversation[]> {
  if (!userId) throw new Error('userId is required to fetch conversations');

  const response = await apiClient.get<ApiResponse<ApiConversation[]>>('/conversations', {
    params: { userId },
  });

  return response.data.data;
}

export async function getConversationMessages(
  conversationId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<MessagesPaginationResponse> {
  if (!conversationId) throw new Error('conversationId is required');

  const params: Record<string, any> = {
    limit: options.limit || 20,
  };

  if (options.cursor) {
    params.cursor = options.cursor;
  }

  const response = await apiClient.get<ApiResponse<MessagesPaginationResponse>>(
    `/conversations/${conversationId}/messages`,
    { params }
  );

  return response.data.data;
}

export async function sendMessage(conversationId: string,
  payload: { senderId: string; content: string }
): Promise<ApiMessage> {
  if (!conversationId) throw new Error('conversationId is required');
  if (!payload.senderId) throw new Error('senderId is required');
  if (!payload.content || !payload.content.trim()) throw new Error('content cannot be empty');

  const response = await apiClient.post<ApiResponse<ApiMessage>>(
    `/conversations/${conversationId}/messages`,
    {
      senderId: payload.senderId,
      content: payload.content.trim(),
    }
  );

  return response.data.data;
}

export interface SearchedUser {
  id: string;
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
  statusText?: string;
}

export async function searchUsers(query = '', currentUserId = ''): Promise<SearchedUser[]> {
  const response = await apiClient.get<ApiResponse<SearchedUser[]>>('/auth/users', {
    params: { q: query, currentUserId },
  });
  return response.data.data;
}

export async function getOrCreateDirectConversation(
  currentUserId: string,
  participantId: string
): Promise<ApiConversation> {
  const response = await apiClient.post<ApiResponse<ApiConversation>>('/conversations/direct', {
    currentUserId,
    participantId,
  });
  return response.data.data;
}
