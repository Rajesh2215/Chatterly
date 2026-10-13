export * from './client';
export * from './conversations';
export * from './auth';

import {
  getConversations,
  getConversationMessages,
  sendMessage,
} from './conversations';

import { register, login, logout, getMe } from './auth';

export const api = {
  getConversations,
  getConversationMessages,
  sendMessage,
  register,
  login,
  logout,
  getMe,
};

export default api;
