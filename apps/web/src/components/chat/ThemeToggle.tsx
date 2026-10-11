'use client';

import React from 'react';
import { ThemeMode } from '@/types/chat';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={onToggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label={`Current theme is ${theme}. Toggle to switch theme.`}
    >
      <span className="theme-toggle-moon" aria-hidden="true">🌙</span>
      <span className="theme-toggle-sun" aria-hidden="true">☀️</span>
      <span className="theme-toggle-indicator" aria-hidden="true">
        {isDark ? (
          <span className="theme-toggle-icon">🌙</span>
        ) : (
          <span className="theme-toggle-icon">☀️</span>
        )}
      </span>
    </button>
  );
};
