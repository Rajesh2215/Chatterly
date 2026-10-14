import { Router } from 'express';
import { register, login, refresh, logout, getMe, searchUsers } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, getMe);
authRouter.get('/users', requireAuth, searchUsers);
