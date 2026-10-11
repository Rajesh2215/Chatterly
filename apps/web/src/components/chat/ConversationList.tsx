'use client';

import React, { useState, useMemo } from 'react';
import { Conversation, ThemeMode, UserProfile } from '@/types/chat';
import { ThemeToggle } from './ThemeToggle';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  currentUser: UserProfile;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onNewChat?: () => void;
  onSwitchUser?: () => void;
  isLoading?: boolean;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUser,
  theme,
  onToggleTheme,
  onNewChat,
  onSwitchUser,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (conv) =>
        conv.peer.displayName.toLowerCase().includes(query) ||
        conv.peer.name.toLowerCase().includes(query) ||
        conv.lastMessage?.content.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  return (
    <aside className="chat-sidebar">
      {/* Brand Bar Header */}
      <div className="sidebar-brand-bar">
        <div className="brand-badge">
          <div className="brand-logo-icon">⚡</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="brand-title">Chatterly</span>
            <span className="brand-version">API LIVE</span>
          </div>
        </div>

        <div className="sidebar-brand-actions">
          {/* Theme Toggle Pill Switch */}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <button
            type="button"
            className="icon-button"
            title="Start new conversation"
            onClick={onNewChat}
            aria-label="New conversation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* User Profile Mini Strip with Switch User Button */}
      <div className="sidebar-user-strip">
        <div className="user-profile-summary" title={`${currentUser.displayName} (${currentUser.name})`}>
          <div className="avatar-container">
            {currentUser.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="avatar-image"
              />
            ) : (
              <div className="avatar-placeholder">
                {currentUser.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className={`status-indicator ${currentUser.status}`} />
          </div>
          <div>
            <div className="user-name-text">{currentUser.displayName}</div>
            <div className="user-status-text">Logged in as @{currentUser.name}</div>
          </div>
        </div>

        {onSwitchUser && (
          <button
            type="button"
            className="user-switch-btn"
            onClick={onSwitchUser}
            title="Switch active user"
          >
            ⇄ Switch User
          </button>
        )}
      </div>

      {/* Search Bar Input */}
      <div className="sidebar-search-box">
        <div className="search-input-wrapper">
          <span className="search-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search conversations"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Inset Conversation Cards List */}
      <div className="conversation-list-container">
        {isLoading ? (
          <div className="empty-conversations-state">
            <span className="spinner" style={{ width: '22px', height: '22px', marginBottom: '8px' }} />
            <span style={{ fontSize: '13px' }}>Loading conversations from API...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="empty-conversations-state">
            <span style={{ fontSize: '26px' }}>📭</span>
            <p style={{ margin: 0, fontWeight: 600 }}>No conversations found</p>
            <span style={{ fontSize: '12px' }}>Inbox is clear</span>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                className={`conversation-card ${isActive ? 'active' : ''}`}
                onClick={() => onSelectConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectConversation(conv.id);
                  }
                }}
              >
                <div className="avatar-container">
                  {conv.peer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={conv.peer.avatarUrl}
                      alt={conv.peer.displayName}
                      className="avatar-image"
                    />
                  ) : (
                    <div className="avatar-placeholder">
                      {conv.peer.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className={`status-indicator ${conv.peer.status}`} />
                </div>

                <div className="conversation-card-content">
                  <div className="conversation-card-header">
                    <span className="peer-name">{conv.peer.displayName}</span>
                    <span className="conversation-time">
                      {conv.lastMessage?.timestamp || ''}
                    </span>
                  </div>

                  <div className="conversation-card-body">
                    <span className="last-message-snippet">
                      {conv.lastMessage?.senderId === currentUser.id && (
                        <span style={{ marginRight: '5px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          You:
                        </span>
                      )}
                      {conv.lastMessage?.content || 'No messages yet'}
                    </span>

                    {conv.unreadCount > 0 && (
                      <span className="unread-badge">{conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
