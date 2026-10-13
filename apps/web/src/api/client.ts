import axios, { AxiosError } from 'axios';
import { ApiResponse } from '@/types/chat';
import { getAccessToken, setAccessToken, clearAuth } from '@/lib/auth';

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_BASE_URL = RAW_API_URL.replace(/\/+$/, '') + (RAW_API_URL.endsWith('/api') ? '' : '/api');

/**
 * Centralized Axios client instance
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  // IMPORTANT: send cookies (refresh token) cross-origin
  withCredentials: true,
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Attach in-memory access token as Bearer header on every request
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
// On 401 → silently try to refresh the access token once, then retry the original request.
// If refresh also fails → clear auth state (user gets redirected to login by middleware).
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<any>>) => {
    const originalRequest = error.config as any;

    // Handle 401 — attempt silent refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/auth/refresh' &&
      originalRequest.url !== '/auth/login'
    ) {
      if (isRefreshing) {
        // Queue requests while refresh is in flight
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await apiClient.post<ApiResponse<{ accessToken: string }>>(
          '/auth/refresh'
        );
        const newToken = refreshRes.data.data.accessToken;
        setAccessToken(newToken);
        onTokenRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (_refreshError) {
        // Refresh failed — session is dead, clear auth and redirect to login
        clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(_refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // For non-401 errors, extract a readable message
    const serverMessage =
      error.response?.data?.error ||
      (error.response?.data as any)?.message ||
      error.message ||
      'API request failed';
    return Promise.reject(new Error(serverMessage));
  }
);
