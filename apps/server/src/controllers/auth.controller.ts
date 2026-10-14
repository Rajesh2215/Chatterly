import { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';

// Cookie options: Secure, httpOnly, 7 days
const REFRESH_COOKIE_NAME = 'chatterly_refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({
        success: false,
        error: 'username, email, and password are required',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long',
      });
      return;
    }

    const { user, tokens } = await authService.register({
      username,
      email,
      password,
      displayName: displayName || username,
    });

    // Send Refresh Token in secure httpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, COOKIE_OPTIONS);

    // Send Access Token in response body
    res.status(201).json({
      success: true,
      data: {
        user,
        accessToken: tokens.accessToken,
      },
    });
  } catch (error: any) {
    const status = error.message.includes('already') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    // Accept either `identifier` or `email` from the frontend
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({
        success: false,
        error: 'Identifier (email/username) and password are required',
      });
      return;
    }

    const { user, tokens } = await authService.login({ identifier, password });

    // Set Refresh Token in secure cookie
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, COOKIE_OPTIONS);

    // Return Access Token in body
    res.status(200).json({
      success: true,
      data: {
        user,
        accessToken: tokens.accessToken,
      },
    });
  } catch (error: any) {
    const status = error.message.includes('Invalid') ? 401 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: 'Refresh token cookie missing',
      });
      return;
    }

    const { accessToken } = await authService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid or expired session',
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear the cookie from the browser
    res.clearCookie(REFRESH_COOKIE_NAME, COOKIE_OPTIONS);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const profile = await authService.getUserProfile(userId);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

export async function searchUsers(req: Request, res: Response): Promise<void> {
  try {
    const query = (req.query.q as string) || '';
    const currentUserId = (req.query.currentUserId as string) || (req as any).user?.userId;

    const users = await authService.searchUsers(query, currentUserId);
    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}
