import axios, { AxiosError } from 'axios';
import { ApiResponse } from '@/types/chat';

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
});

// Request interceptor: Prepares request headers / authorization tokens
apiClient.interceptors.request.use(
  (config) => {
    // Read auth token from localStorage if user authentication is added
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('chatterly_auth_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Extracts structured backend error messages
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<any>>) => {
    const serverMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'API request failed';
    return Promise.reject(new Error(serverMessage));
  }
);
