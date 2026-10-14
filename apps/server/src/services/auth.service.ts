import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ulid } from 'ulid';
import { User, IUser } from '../models/User.js';
import { redis } from '../config/redis.js';

export interface UserPublicDto {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  statusText?: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // Unique session ID tracked in Redis
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET || 'fallback_access_secret_chatterly';
  }

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_chatterly';
  }

  async generateTokens(user: IUser & { _id: any }): Promise<AuthTokens> {
    const userId = user._id.toString();

    const accessToken = jwt.sign(
      { userId, username: user.username, email: user.email } as TokenPayload,
      this.accessSecret,
      { expiresIn: '15m' }
    );

    // Refresh Token with a unique ULID session identifier (7 days)
    const tokenId = ulid();
    const refreshToken = jwt.sign(
      { userId, tokenId } as RefreshTokenPayload,
      this.refreshSecret,
      { expiresIn: '7d' }
    );

    // Track session in Redis with 7-day TTL (enables instant logout/revocation)
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    await redis.set(`refresh:${userId}:${tokenId}`, 'valid', 'EX', sevenDaysInSeconds);

    return { accessToken, refreshToken };
  }

  async register(data: {
    username: string;
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ user: UserPublicDto; tokens: AuthTokens }> {
    const { username, email, password, displayName } = data;

    // Check if username or email already exists
    const existing = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existing) {
      if (existing.username === username.toLowerCase()) {
        throw new Error('Username is already taken');
      }
      throw new Error('Email is already registered');
    }

    // Hash password with salt rounds = 10
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      displayName,
    });

    const tokens = await this.generateTokens(newUser as any);

    return {
      user: {
        id: (newUser._id as any).toString(),
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
        avatarUrl: newUser.avatarUrl,
        statusText: newUser.statusText,
      },
      tokens,
    };
  }

  async login(data: {
    identifier: string; // can be email or username
    password: string;
  }): Promise<{ user: UserPublicDto; tokens: AuthTokens }> {
    const { identifier, password } = data;

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
    }).select('+password');

    if (!user || !user.password) {
      throw new Error('Invalid email/username or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email/username or password');
    }

    const tokens = await this.generateTokens(user as any);

    return {
      user: {
        id: (user._id as any).toString(),
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        statusText: user.statusText,
      },
      tokens,
    };
  }

  async refreshAccessToken(token: string): Promise<{ accessToken: string }> {
    try {
      const decoded = jwt.verify(token, this.refreshSecret) as RefreshTokenPayload;

      // Verify the session is still active in Redis
      const isValid = await redis.get(`refresh:${decoded.userId}:${decoded.tokenId}`);
      if (!isValid) {
        throw new Error('Session revoked or expired');
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const accessToken = jwt.sign(
        { userId: user._id.toString(), username: user.username, email: user.email } as TokenPayload,
        this.accessSecret,
        { expiresIn: '15m' }
      );

      return { accessToken };
    } catch {
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Logout: Revokes the refresh token session from Redis
  async logout(token: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, this.refreshSecret) as RefreshTokenPayload;
      await redis.del(`refresh:${decoded.userId}:${decoded.tokenId}`);
    } catch {
      // If token is invalid or expired, no action needed
    }
  }

  async getUserProfile(userId: string): Promise<UserPublicDto> {
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName || user.username,
      avatarUrl: user.avatarUrl,
      statusText: user.statusText,
    };
  }

  async searchUsers(query = '', excludeUserId?: string): Promise<UserPublicDto[]> {
    const filter: any = {};

    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }

    if (query.trim()) {
      filter.$or = [
        { username: { $regex: query.trim(), $options: 'i' } },
        { displayName: { $regex: query.trim(), $options: 'i' } },
        { email: { $regex: query.trim(), $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('_id username displayName avatarUrl statusText lastSeenAt email')
      .limit(30)
      .lean();

    return users.map((u: any) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email,
      displayName: u.displayName || u.username,
      avatarUrl: u.avatarUrl,
      statusText: u.statusText,
    }));
  }
}

export const authService = new AuthService();
