import {
  ApiConversation,
  ApiMessage,
  ApiResponse,
  MessagesPaginationResponse,
} from '@/types/chat';

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_BASE_URL = RAW_API_URL.replace(/\/+$/, '') + (RAW_API_URL.endsWith('/api') ? '' : '/api');

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data: ApiResponse<T> = await response.json();

  if (!response.ok || !data.success) {
    throw new ApiError(data.error || `HTTP request failed: ${response.status}`, response.status);
  }

  return data.data;
}

/**
 * 1. Fetch User's Inbox / Conversations
 * Endpoint: GET /api/conversations?userId=<USER_ID>
 */
export async function getConversations(userId: string): Promise<ApiConversation[]> {
  if (!userId) throw new Error('userId is required to fetch conversations');
  return request<ApiConversation[]>(`/conversations?userId=${encodeURIComponent(userId)}`);
}

/**
 * 2. Fetch Messages with ULID Cursor Pagination
 * Endpoint: GET /api/conversations/:id/messages?cursor=<ULID>&limit=20
 */
export async function getConversationMessages(
  conversationId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<MessagesPaginationResponse> {
  if (!conversationId) throw new Error('conversationId is required');

  const params = new URLSearchParams();
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  } else {
    params.set('limit', '20');
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  return request<MessagesPaginationResponse>(`/conversations/${conversationId}/messages${query}`);
}

/**
 * 3. Send a Message
 * Endpoint: POST /api/conversations/:id/messages
 * Body: { senderId: "<USER_ID>", content: "<CONTENT>" }
 */
export async function sendMessage(
  conversationId: string,
  payload: { senderId: string; content: string }
): Promise<ApiMessage> {
  if (!conversationId) throw new Error('conversationId is required');
  if (!payload.senderId) throw new Error('senderId is required');
  if (!payload.content || !payload.content.trim()) throw new Error('content cannot be empty');

  return request<ApiMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      senderId: payload.senderId,
      content: payload.content.trim(),
    }),
  });
}

export const api = {
  getConversations,
  getConversationMessages,
  sendMessage,
};
