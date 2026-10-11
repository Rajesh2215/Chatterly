import { Router } from 'express';
import { getOrCreateDirect, sendMessage } from '../controllers/conversation.controller.js';

export const conversationRouter = Router();

conversationRouter.post('/direct', getOrCreateDirect);

conversationRouter.post('/:id/messages', sendMessage);