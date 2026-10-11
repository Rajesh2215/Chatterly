'use client';

import React, { useState, useRef, useEffect } from 'react';

interface MessageComposerProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
}) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [content]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSendDisabled = disabled || content.trim().length === 0;

  return (
    <footer className="composer-footer">
      <div className="composer-floating-dock">
        <div className="composer-actions-left">
          <button
            type="button"
            className="icon-button"
            title="Add emoji"
            onClick={() => setContent((prev) => prev + ' ✨')}
            aria-label="Add emoji"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-button"
            title="Attach file"
            aria-label="Attach file"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        </div>

        <div className="composer-input-container">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Type a message"
          />
        </div>

        <button
          type="button"
          className="send-button"
          onClick={handleSend}
          disabled={isSendDisabled}
          title="Send message (Enter)"
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="composer-hint">
        <span>Press <kbd style={{ padding: '1px 4px', background: 'var(--bg-input)', borderRadius: '4px' }}>Enter</kbd> to send, <kbd style={{ padding: '1px 4px', background: 'var(--bg-input)', borderRadius: '4px' }}>Shift + Enter</kbd> for new line</span>
        {content.length > 0 && <span>{content.length} chars</span>}
      </div>
    </footer>
  );
};
