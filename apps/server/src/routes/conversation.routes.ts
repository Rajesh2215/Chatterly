import { Router } from 'express';
import { getMessages, getOrCreateDirect, sendMessage } from '../controllers/conversation.controller.js';

export const conversationRouter = Router();

conversationRouter.post('/direct', getOrCreateDirect);

conversationRouter.post('/:id/messages', sendMessage);

conversationRouter.get('/:id/messages', getMessages);