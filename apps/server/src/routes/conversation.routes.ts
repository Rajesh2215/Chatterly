import { Router } from 'express';
import { getMessages, getOrCreateDirect, getUserConversations, sendMessage } from '../controllers/conversation.controller.js';

export const conversationRouter = Router();

conversationRouter.get('/', getUserConversations);

conversationRouter.post('/direct', getOrCreateDirect);

conversationRouter.post('/:id/messages', sendMessage);

conversationRouter.get('/:id/messages', getMessages);