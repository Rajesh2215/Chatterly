import { Router } from 'express';
import { getOrCreateDirect } from '../controllers/conversation.controller.js';

export const conversationRouter = Router();

conversationRouter.post('/direct', getOrCreateDirect);