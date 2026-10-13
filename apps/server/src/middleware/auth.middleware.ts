import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../services/auth.service.js';

// Extend Express Request interface to strongly type req.user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required (missing Bearer token)',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const accessSecret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret_chatterly';

  try {
    const decoded = jwt.verify(token, accessSecret) as TokenPayload;
    req.user = decoded; // Attached for all subsequent handlers to read req.user.userId!
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired access token',
    });
  }
}
