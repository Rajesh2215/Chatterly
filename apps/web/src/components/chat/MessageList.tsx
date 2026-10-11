'use client';

import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Conversation, Message, UserProfile } from '@/types/chat';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  conversation: Conversation;
  currentUser: UserProfile;
  onLoadOlderMessages?: () => Promise<void> | void;
  isLoadingOlder?: boolean;
  onBack?: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  conversation,
  currentUser,
  onLoadOlderMessages,
  isLoadingOlder = false,
  onBack,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const isInitialMountRef = useRef<boolean>(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const currentConvIdRef = useRef(conversation.id);

  // Reset scroll to bottom when switching conversation
  useEffect(() => {
    if (currentConvIdRef.current !== conversation.id) {
      currentConvIdRef.current = conversation.id;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [conversation.id]);

  // Auto-scroll to bottom on conversation change or new message
  useEffect(() => {
    if (isInitialMountRef.current) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      isInitialMountRef.current = false;
      return;
    }

    if (shouldAutoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [conversation.messages.length, conversation.id, shouldAutoScroll]);

  // Adjust scroll position after prepending older messages so user view doesn't jump
  useLayoutEffect(() => {
    if (scrollContainerRef.current && previousScrollHeightRef.current > 0) {
      const heightDifference = scrollContainerRef.current.scrollHeight - previousScrollHeightRef.current;
      scrollContainerRef.current.scrollTop = heightDifference;
      previousScrollHeightRef.current = 0;
    }
  }, [conversation.messages.length]);

  const handleLoadOlder = async () => {
    if (!onLoadOlderMessages || isLoadingOlder) return;
    if (scrollContainerRef.current) {
      previousScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    }
    await onLoadOlderMessages();
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setShouldAutoScroll(isAtBottom);

    // Auto trigger older messages when scrolling to top
    if (scrollTop <= 15 && conversation.hasOlderMessages && !isLoadingOlder && onLoadOlderMessages) {
      handleLoadOlder();
    }
  };

  const { peer } = conversation;

  return (
    <div className="chat-viewport">
      <div className="chat-viewport-background" aria-hidden="true" />

      {/* Chat Header */}
      <header className="chat-header">
        <div className="chat-header-peer">
          {onBack && (
            <button
              type="button"
              className="chat-back-btn"
              onClick={onBack}
              title="Back to conversations"
              aria-label="Back to conversations"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          )}

          <div className="avatar-container">
            {peer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peer.avatarUrl}
                alt={peer.displayName}
                className="avatar-image"
              />
            ) : (
              <div className="avatar-placeholder">
                {peer.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className={`status-indicator ${peer.status}`} />
          </div>

          <div className="peer-info">
            <span className="peer-info-name">{peer.displayName}</span>
            <div className="peer-info-status">
              <span className={`status-dot-mini ${peer.status === 'online' ? 'online' : ''}`} />
              <span>
                {peer.status === 'online'
                  ? 'online'
                  : peer.lastSeen
                  ? `last seen ${peer.lastSeen}`
                  : 'offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          <button type="button" className="icon-button" title="Start voice call" aria-label="Voice call">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
          <button type="button" className="icon-button" title="Search in chat" aria-label="Search chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button type="button" className="icon-button" title="More options" aria-label="More options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="messages-scroll-area"
        onScroll={handleScroll}
      >
        {conversation.hasOlderMessages && (
          <div className="load-older-container">
            <button
              type="button"
              className="load-older-btn"
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? (
                <>
                  <span className="spinner" />
                  <span>Loading older history...</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                  <span>Load older messages</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="date-separator">
          <span className="date-separator-badge">Today</span>
        </div>

        {conversation.messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No messages yet. Say hello to {peer.displayName}!
          </div>
        ) : (
          conversation.messages.map((message: Message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isSelf={message.senderId === currentUser.id}
            />
          ))
        )}
      </div>
    </div>
  );
};
