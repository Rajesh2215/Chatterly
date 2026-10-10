import { Router } from 'express';
import { conversationRouter } from './conversation.routes.js';

export const apiRouter = Router();

// All routes registered here are automatically prefixed with /api
apiRouter.use('/conversations', conversationRouter);
