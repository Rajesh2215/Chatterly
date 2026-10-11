export * from './client';
export * from './conversations';

import {
  getConversations,
  getConversationMessages,
  sendMessage,
} from './conversations';

export const api = {
  getConversations,
  getConversationMessages,
  sendMessage,
};

export default api;
