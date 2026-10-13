'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { register } from '@/api/auth';
import { setAccessToken, setCurrentUser, isAuthenticated } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/');
    }
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email, username, displayName, password, confirmPassword } = form;

    if (!email.trim() || !username.trim() || !password) {
      setError('Email, username, and password are required');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { user, accessToken } = await register({
        email: email.trim(),
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || username.trim(),
        password,
      });
      setAccessToken(accessToken);
      setCurrentUser(user);
      router.replace('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
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

        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Start messaging in seconds</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="reg-email" className="auth-label">Email</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="auth-field-row">
            <div className="auth-field">
              <label htmlFor="reg-username" className="auth-label">Username</label>
              <input
                id="reg-username"
                name="username"
                type="text"
                className="auth-input"
                placeholder="john_doe"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-displayName" className="auth-label">Display Name</label>
              <input
                id="reg-displayName"
                name="displayName"
                type="text"
                className="auth-input"
                placeholder="John Doe"
                value={form.displayName}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="reg-password" className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <input
                id="reg-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input auth-input-pw"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
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

          <div className="auth-field">
            <label htmlFor="reg-confirm-password" className="auth-label">Confirm Password</label>
            <input
              id="reg-confirm-password"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              className="auth-input"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            id="register-submit"
            type="submit"
            className="auth-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-spinner" />
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link href="/login" className="auth-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
