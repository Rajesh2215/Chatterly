'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login } from '@/api/auth';
import { setAccessToken, setCurrentUser, isAuthenticated } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // If already authenticated, redirect to chat
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user, accessToken } = await login({ email: email.trim(), password });
      setAccessToken(accessToken);
      setCurrentUser(user);
      router.replace('/');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">⚡</span>
          <span className="auth-logo-text">Chatterly</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue messaging</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">Email</label>
            <input
              id="login-email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input auth-input-pw"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="auth-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-spinner" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="auth-link">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
