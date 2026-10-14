'use client';

import React, { useState, useEffect } from 'react';
import { searchUsers, SearchedUser } from '@/api/conversations';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: SearchedUser) => void;
  currentUserId: string;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  currentUserId,
}) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SearchedUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    const debounceTimer = setTimeout(() => {
      searchUsers(query, currentUserId)
        .then((data) => {
          if (isMounted) setUsers(data || []);
        })
        .catch((err) => {
          console.error('Failed to search users:', err);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [isOpen, query, currentUserId]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-shell, #09090b)',
          border: '1px solid var(--border-color, #27272a)',
          borderRadius: '16px',
          width: '440px',
          maxWidth: '100%',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid var(--border-color, #1f1f23)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary, #ffffff)',
                margin: 0,
              }}
            >
              Start New Conversation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #71717a)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Search Input Box */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #1f1f23)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'var(--bg-input, #18181b)',
              border: '1px solid var(--border-color, #27272a)',
              borderRadius: '10px',
              padding: '8px 14px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted, #71717a)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by username, name, or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary, #ffffff)',
                fontSize: '14px',
                width: '100%',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #71717a)',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Users List Container */}
        <div
          style={{
            maxHeight: '320px',
            overflowY: 'auto',
            padding: '8px 12px',
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                color: 'var(--text-muted, #71717a)',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#ffffff',
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Searching users...
            </div>
          ) : users.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                color: 'var(--text-muted, #71717a)',
                fontSize: '13px',
              }}
            >
              {query ? 'No users matching your search.' : 'No other users registered yet.'}
            </div>
          ) : (
            users.map((user) => {
              const initials = (user.displayName || user.username || 'U')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={user.id || user._id}
                  onClick={() => {
                    onSelectUser(user);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    marginBottom: '4px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-input, #18181b)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        initials
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: 'var(--text-primary, #ffffff)',
                        }}
                      >
                        {user.displayName || user.username}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted, #71717a)',
                        }}
                      >
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted, #71717a)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    Chat →
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
