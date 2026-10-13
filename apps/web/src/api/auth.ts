import { apiClient } from './client';
import { ApiResponse } from '@/types/chat';
import { AuthUser } from '@/lib/auth';

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthSuccessResponse {
  user: AuthUser;
  accessToken: string;
}

export async function register(payload: RegisterPayload): Promise<AuthSuccessResponse> {
  const res = await apiClient.post<ApiResponse<AuthSuccessResponse>>('/auth/register', payload);
  return res.data.data;
}

export async function login(payload: LoginPayload): Promise<AuthSuccessResponse> {
  const res = await apiClient.post<ApiResponse<AuthSuccessResponse>>('/auth/login', payload);
  return res.data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function getMe(): Promise<AuthUser> {
  const res = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
  return res.data.data;
}
