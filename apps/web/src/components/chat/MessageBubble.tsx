'use client';

import React from 'react';
import { Message, MessageStatus } from '@/types/chat';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isSelf }) => {
  const renderDeliveryTick = (status: MessageStatus) => {
    switch (status) {
      case 'sending':
        return <span className="delivery-tick sending" title="Sending...">🕒</span>;
      case 'sent':
        return <span className="delivery-tick sent" title="Sent">✓</span>;
      case 'delivered':
        return <span className="delivery-tick delivered" title="Delivered">✓✓</span>;
      case 'read':
        return <span className="delivery-tick read" title="Read">✓✓</span>;
      default:
        return null;
    }
  };

  return (
    <div className={`message-row ${isSelf ? 'self' : 'peer'}`}>
      <div className={`message-bubble ${isSelf ? 'self' : 'peer'}`}>
        <div className="message-content">{message.content}</div>
        <div className="message-meta">
          <span className="message-timestamp">{message.timestamp}</span>
          {isSelf && renderDeliveryTick(message.status)}
        </div>
      </div>
    </div>
  );
};
