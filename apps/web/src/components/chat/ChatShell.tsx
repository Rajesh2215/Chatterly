'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Conversation, Message, ThemeMode, UserProfile } from '@/types/chat';
import { CURRENT_USER, MOCK_CONVERSATIONS, MOCK_OLDER_MESSAGES_ALICE } from '@/data/mockData';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface ChatShellProps {
  initialTheme?: ThemeMode;
}

export const ChatShell: React.FC<ChatShellProps> = ({ initialTheme = 'dark' }) => {
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv_alice');
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [currentUser] = useState<UserProfile>(CURRENT_USER);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('chatterly_theme') as ThemeMode | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, [initialTheme]);

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('chatterly_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Handle selecting a conversation
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    // Mark messages as read when opening conversation
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === id) {
          return {
            ...conv,
            unreadCount: 0,
          };
        }
        return conv;
      })
    );
  };

  // Back button handler for mobile
  const handleBackToConversations = () => {
    setActiveConversationId(null);
  };

  // Handle sending a message
  const handleSendMessage = useCallback(
    (text: string) => {
      if (!activeConversationId) return;

      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newMessageId = `msg_${Date.now()}`;
      const newMessage: Message = {
        id: newMessageId,
        senderId: currentUser.id,
        receiverId: activeConversation?.peer.id || '',
        content: text,
        timestamp: timeString,
        status: 'sent',
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeConversationId) {
            return {
              ...conv,
              messages: [...conv.messages, newMessage],
              lastMessage: {
                content: text,
                timestamp: timeString,
                status: 'sent',
                senderId: currentUser.id,
              },
            };
          }
          return conv;
        })
      );

      // Simulate delivery to 'delivered' and 'read'
      setTimeout(() => {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConversationId) {
              const updated = conv.messages.map((m) =>
                m.id === newMessageId ? { ...m, status: 'delivered' as const } : m
              );
              return {
                ...conv,
                messages: updated,
                lastMessage:
                  conv.lastMessage?.content === text
                    ? { ...conv.lastMessage, status: 'delivered' as const }
                    : conv.lastMessage,
              };
            }
            return conv;
          })
        );
      }, 900);

      // Simulate peer reading and quick friendly response if Alice
      if (activeConversationId === 'conv_alice') {
        setTimeout(() => {
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id === activeConversationId) {
                const updated = conv.messages.map((m) =>
                  m.id === newMessageId ? { ...m, status: 'read' as const } : m
                );
                return {
                  ...conv,
                  messages: updated,
                  lastMessage:
                    conv.lastMessage?.content === text
                      ? { ...conv.lastMessage, status: 'read' as const }
                      : conv.lastMessage,
                };
              }
              return conv;
            })
          );
        }, 2200);

        // Friendly auto-reply from Alice after 3.2s
        setTimeout(() => {
          const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const replyMessage: Message = {
            id: `msg_alice_${Date.now()}`,
            senderId: 'user_alice',
            receiverId: currentUser.id,
            content: `Got it! That looks awesome Alex ✨`,
            timestamp: replyTime,
            status: 'read',
          };

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id === 'conv_alice') {
                return {
                  ...conv,
                  messages: [...conv.messages, replyMessage],
                  lastMessage: {
                    content: replyMessage.content,
                    timestamp: replyTime,
                    status: 'read',
                    senderId: 'user_alice',
                  },
                };
              }
              return conv;
            })
          );
        }, 3600);
      }
    },
    [activeConversationId, activeConversation, currentUser.id]
  );

  // Handle loading older messages
  const handleLoadOlderMessages = async () => {
    if (!activeConversationId) return;
    setIsLoadingOlder(true);

    // Simulate network delay for fetching earlier messages from API / MongoDB
    await new Promise((resolve) => setTimeout(resolve, 800));

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id === activeConversationId && conv.hasOlderMessages) {
          return {
            ...conv,
            hasOlderMessages: false,
            messages: [...MOCK_OLDER_MESSAGES_ALICE, ...conv.messages],
          };
        }
        return conv;
      })
    );

    setIsLoadingOlder(false);
  };

  return (
    <div className="chatterly-app-root" data-theme={theme}>
      <div className={`chat-shell ${activeConversationId ? 'chat-open' : ''}`}>
        {/* Left Column (Sidebar, ~340-360px) */}
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onNewChat={() => {
            // Cycle or focus on next conversation
            if (activeConversationId === 'conv_alice') {
              handleSelectConversation('conv_bob');
            } else {
              handleSelectConversation('conv_alice');
            }
          }}
        />

        {/* Right Column (Main Chat Viewport) */}
        {activeConversation ? (
          <main className="chat-viewport" style={{ display: 'flex' }}>
            <MessageList
              conversation={activeConversation}
              currentUser={currentUser}
              onLoadOlderMessages={handleLoadOlderMessages}
              isLoadingOlder={isLoadingOlder}
              onBack={handleBackToConversations}
            />
            <MessageComposer
              onSendMessage={handleSendMessage}
              placeholder={`Message ${activeConversation.peer.displayName}...`}
            />
          </main>
        ) : (
          <div className="empty-viewport-state">
            <div className="empty-viewport-icon">💬</div>
            <h2 className="empty-viewport-title">Chatterly Web</h2>
            <p className="empty-viewport-subtitle">
              Send and receive real-time messages with end-to-end reliability.
              Select a conversation from the sidebar to start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
