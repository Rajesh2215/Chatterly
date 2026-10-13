import { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { User } from '../models/User.js';

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

    if (!username || !email || !password || !displayName) {
      res.status(400).json({
        success: false,
        error: 'username, email, password, and displayName are all required',
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
      displayName,
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
    const { identifier, password } = req.body;

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
    // req.user will be attached by our auth middleware!
    const userId = (req as any).user?.userId;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}
