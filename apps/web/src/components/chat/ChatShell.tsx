'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ApiConversation, Conversation, Message, ThemeMode, UserProfile } from '@/types/chat';
import {
  getConversations,
  getConversationMessages,
  sendMessage,
} from '@/api';
import { getMe, logout as apiLogout } from '@/api/auth';
import { getCurrentUser, setCurrentUser as setAuthUser, clearAuth, getAccessToken } from '@/lib/auth';
import {
  formatConversationTime,
  formatMessageTime,
  transformApiConversationToUi,
  transformApiMessageToUi,
} from '@/lib/transformers';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { NewChatModal } from './NewChatModal';
import { getOrCreateDirectConversation, SearchedUser } from '@/api/conversations';
import { useSocket } from '@/hooks/useSocket';
import { MessagePayload, MessageStatusPayload, TypingPayload, UserPresencePayload } from '@/lib/socket.types';
import { disconnectSocket } from '@/lib/socket';

interface ChatShellProps {
  initialTheme?: ThemeMode;
}

const INITIAL_EMPTY_USER: UserProfile = {
  id: '',
  name: '',
  displayName: '',
  status: 'online',
};

export const ChatShell: React.FC<ChatShellProps> = ({ initialTheme = 'dark' }) => {
  const router = useRouter();

  const cachedAuth = getCurrentUser();

  const [currentUserId, setCurrentUserId] = useState<string>(cachedAuth?.id || '');
  const [currentUser, setCurrentUserState] = useState<UserProfile>(
    cachedAuth
      ? {
        id: cachedAuth.id,
        name: cachedAuth.username,
        displayName: cachedAuth.displayName,
        avatarUrl: cachedAuth.avatarUrl,
        status: 'online',
        customStatus: cachedAuth.statusText || 'Active',
      }
      : INITIAL_EMPTY_USER
  );
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(!cachedAuth);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});   // { userId: username } — tracks who is currently typing

  // Restore auth session on mount (silent refresh via httpOnly cookie)
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // getMe hits /api/auth/me — if access token is expired, the
        // client.ts interceptor will silently call /auth/refresh first
        const user = await getMe();
        setAuthUser(user);
        setCurrentUserState({
          id: user.id,
          name: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          status: 'online',
          customStatus: user.statusText || 'Active',
        });
        setCurrentUserId(user.id);
      } catch {
        // Refresh failed → redirect to login
        clearAuth();
        router.replace('/login');
      } finally {
        setIsAuthLoading(false);
      }
    };
    if (!cachedAuth) {
      restoreSession();
    } else {
      setIsAuthLoading(false);
    }
  }, [router, cachedAuth]);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('chatterly_theme') as ThemeMode | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, [initialTheme]);

  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Socket: incoming real-time message
  const handleNewMessage = useCallback(
    async (msg: MessagePayload) => {

      const uiMsg = {
        id: msg._id,
        senderId: msg.senderId,
        content: msg.content,
        timestamp: new Date(msg.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: msg.deliveryStatus as any,
        createdAt: msg.createdAt,
      };

      const isActiveConversation = activeConversationIdRef.current === msg.conversationId;
      const isFromSelf = msg.senderId === currentUserId;
      if (!isFromSelf) {
        // 1. Tell sender: "Message was delivered to my device ✓✓"
        emitMessageStatus({
          messageId: msg._id,
          conversationId: msg.conversationId,
          senderId: msg.senderId,
          status: 'delivered',
        });

        // 2. If I already have this chat open, also mark it as read immediately!
        if (isActiveConversation) {
          emitMessageStatus({
            messageId: msg._id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            status: 'read',
          });
        }
      }

      const convExists = conversations.some((c) => c.id === msg.conversationId);
      if (!convExists) {
        const apiConvs = await getConversations(currentUserId);
        const uiConvs = apiConvs.map((c) => {
          const uiConv = transformApiConversationToUi(c, currentUserId);
          if (uiConv.id === msg.conversationId) {
            return {
              ...uiConv,
              unreadCount: isActiveConversation || isFromSelf ? 0 : 1,
              messages: [uiMsg],
            };
          }
          return uiConv;
        });
        setConversations(uiConvs);
        return;
      }

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== msg.conversationId) return conv;
          // Avoid duplicate
          const exists = conv.messages.some((m) => m.id === msg._id);
          if (exists) return conv;

          // If sender has a pending optimistic message matching content, replace it
          const hasPending = conv.messages.some(
            (m) => m.status === 'pending' && m.content === msg.content
          );
          const nextMessages = hasPending
            ? conv.messages.map((m) =>
              m.status === 'pending' && m.content === msg.content ? uiMsg : m
            )
            : [...conv.messages, uiMsg];

          // Increment unread count if message is from peer in another chat
          const isFromSelf = msg.senderId === currentUserId;
          const nextUnreadCount =
            isActiveConversation || isFromSelf
              ? 0
              : (conv.unreadCount || 0) + 1;

          return {
            ...conv,
            unreadCount: nextUnreadCount,
            messages: nextMessages,
            lastMessage: {
              id: msg._id,
              content: msg.content,
              timestamp: new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              senderId: msg.senderId,
              status: 'sent',
            },
          };
        })
      );
    },
    [conversations, currentUserId]
  );

  // Socket: typing indicators
  const handleUserTyping = useCallback((payload: TypingPayload) => {
    if (payload.userId === currentUserId) return; // ignore self
    // Only display typing indicator if it belongs to the active conversation
    if (activeConversationIdRef.current === payload.conversationId) {
      setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.username }));
    }
  }, [currentUserId]);

  const handleUserStopTyping = useCallback((payload: TypingPayload) => {
    setTypingUsers((prev) => {
      const next = { ...prev };
      delete next[payload.userId];
      return next;
    });
  }, []);

  const handleMessageStatus = useCallback((payload: MessageStatusPayload) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== payload.conversationId) return conv;

        const nextMessages = conv.messages.map((m) => {
          // If messageId matches, or if bulk update (no messageId), update the status
          if (!payload.messageId || m.id === payload.messageId) {
            // Never downgrade an already 'read' message back to 'delivered'
            if (m.status === 'read' && payload.status === 'delivered') {
              return m;
            }
            return { ...m, status: payload.status };
          }
          return m;
        });

        const nextLastMessage =
          conv.lastMessage && (!payload.messageId || conv.lastMessage.id === payload.messageId)
            ? conv.lastMessage.status === 'read' && payload.status === 'delivered'
              ? conv.lastMessage
              : { ...conv.lastMessage, status: payload.status }
            : conv.lastMessage;

        return {
          ...conv,
          messages: nextMessages,
          lastMessage: nextLastMessage,
        };
      })
    );
  }, []);


  const handleInitialPresence = useCallback((onlineUserIds: string[]) => {
    setConversations((prev) =>
      prev.map((conv) => {
        const isOnline = onlineUserIds.includes(conv.peer.id);
        return {
          ...conv,
          peer: {
            ...conv.peer,
            status: isOnline ? 'online' : 'offline',
          },
        };
      })
    );
  }, []);

  const handleUserPresence = useCallback((payload: UserPresencePayload) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.peer.id !== payload.userId) return conv;
        return {
          ...conv,
          peer: {
            ...conv.peer,
            status: payload.status,
            lastSeen: payload.lastSeenAt
              ? formatConversationTime(payload.lastSeenAt)
              : conv.peer.lastSeen,
          },
        };
      })
    );
  }, []);

  const { emitSendMessage, emitTypingStart, emitTypingStop, emitMessageStatus } = useSocket({
    accessToken: getAccessToken(),
    activeConversationId,
    onNewMessage: handleNewMessage,
    onUserTyping: handleUserTyping,
    onUserStopTyping: handleUserStopTyping,
    onMessageStatus: handleMessageStatus,
    onUserPresence: handleUserPresence,
    onInitialPresence: handleInitialPresence,
  });


  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('chatterly_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Fetch initial 20 messages for a conversation
  const fetchMessagesForConversation = useCallback(
    async (conversationId: string) => {
      try {
        setIsLoadingMessages(true);
        const result = await getConversationMessages(conversationId, { limit: 20 });
        const uiMessages = result.messages.map(transformApiMessageToUi);

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                messages: uiMessages,
                hasOlderMessages: result.hasMore,
                nextCursor: result.nextCursor,
              };
            }
            return conv;
          })
        );
      } catch (err: any) {
        console.error('Failed to fetch conversation messages:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    []
  );

  // Fetch conversations for the active user
  const loadUserConversations = useCallback(
    async (userId: string) => {
      try {
        setIsLoadingConversations(true);
        setApiError(null);
        const apiConvs: ApiConversation[] = await getConversations(userId);

        const uiConvs = apiConvs.map((c) => transformApiConversationToUi(c, userId));
        setConversations(uiConvs);

        // Keep activeConversationId as null on initial load (like WhatsApp Web).
        // Conversations are only opened and marked as read when the user explicitly clicks one.
        if (!activeConversationIdRef.current) {
          setActiveConversationId(null);
        }
      } catch (err: any) {
        console.error('Failed to load user conversations:', err);
        setApiError(err.message || 'Failed to connect to backend server');
        setConversations([]);
        setActiveConversationId(null);
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [fetchMessagesForConversation]
  );

  // Handle logout
  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {/* ignore */ } finally {
      disconnectSocket(); // ← add this
      clearAuth();
      router.replace('/login');
    }
  };


  // Initial load: Fetch inbox whenever currentUserId changes
  useEffect(() => {
    if (currentUserId && !isAuthLoading) {
      loadUserConversations(currentUserId);
    }
  }, [currentUserId, isAuthLoading, loadUserConversations]);


  // Handle selecting a conversation
  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);

    // Reset unread count for the selected conversation
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );

    // If conversation messages are not loaded yet, fetch from server
    const existing = conversations.find((c) => c.id === id);
    if (!existing || existing.messages.length === 0) {
      await fetchMessagesForConversation(id);
    }

    const selectedConv = conversations.find((c) => c.id === id);
    if (selectedConv && selectedConv.peer.id) {
      emitMessageStatus({
        conversationId: id,
        senderId: selectedConv.peer.id,
        status: 'read',
      });
    }

  };

  const handleSelectUserToChat = async (targetUser: SearchedUser) => {
    try {
      setIsLoadingConversations(true);
      const targetId = targetUser.id || targetUser._id;
      const apiConv = await getOrCreateDirectConversation(currentUser.id, targetId);

      // Refresh user's conversations
      const apiConvs = await getConversations(currentUser.id);
      const uiConvs = apiConvs.map((c) => transformApiConversationToUi(c, currentUser.id));
      setConversations(uiConvs);

      const convId = String(apiConv._id);
      setActiveConversationId(convId);
      await fetchMessagesForConversation(convId);
    } catch (err: any) {
      console.error('Failed to initiate conversation:', err);
      setApiError(err.message || 'Failed to start conversation');
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Back button handler for mobile
  const handleBackToConversations = () => {
    setActiveConversationId(null);
  };

  // Optimistic UI on Send
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeConversationId) return;

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      const timeString = formatMessageTime(now.toISOString());

      // 1. Optimistic Message with 'pending' status
      const optimisticMessage: Message = {
        id: tempId,
        senderId: currentUser.id,
        content: text,
        timestamp: timeString,
        status: 'pending',
        createdAt: now.toISOString(),
      };

      // 2. Immediately append to local state
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeConversationId) {
            return {
              ...conv,
              messages: [...conv.messages, optimisticMessage],
              lastMessage: {
                id: tempId,
                content: text,
                timestamp: timeString,
                status: 'pending',
                senderId: currentUser.id,
              },
            };
          }
          return conv;
        })
      );

      // 3. Send via real-time WebSocket
      try {
        emitSendMessage(activeConversationId, text);
      } catch (err: any) {
        console.error('Failed to emit message via socket:', err);
      }
    },
    [activeConversationId, currentUser.id, emitSendMessage]
  );

  // Scroll-Up Pagination with ULID cursor
  const handleLoadOlderMessages = async () => {
    if (!activeConversationId) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv || !activeConv.hasOlderMessages || !activeConv.nextCursor || isLoadingOlder) {
      return;
    }

    try {
      setIsLoadingOlder(true);
      const result = await getConversationMessages(activeConversationId, {
        cursor: activeConv.nextCursor,
        limit: 20,
      });

      const olderUiMessages = result.messages.map(transformApiMessageToUi);

      // Prepend older messages smoothly without resetting scroll
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeConversationId) {
            return {
              ...conv,
              messages: [...olderUiMessages, ...conv.messages],
              hasOlderMessages: result.hasMore,
              nextCursor: result.nextCursor,
            };
          }
          return conv;
        })
      );
    } catch (err: any) {
      console.error('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  if (isAuthLoading) {
    return (
      <div className="chatterly-app-root" data-theme={theme}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b', fontSize: '0.9rem' }}>
          <span style={{ marginRight: '0.5rem' }}>⚡</span> Restoring session...
        </div>
      </div>
    );
  }

  return (
    <div className="chatterly-app-root" data-theme={theme}>
      <div className={`chat-shell ${activeConversationId ? 'chat-open' : ''}`}>
        {/* Left Column (Sidebar, ~360px) */}
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          currentUser={currentUser}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogout={handleLogout}
          isLoading={isLoadingConversations}
          onNewChat={() => setIsNewChatModalOpen(true)}
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
              typingUsers={typingUsers}
            />
            <MessageComposer
              onSendMessage={handleSendMessage}
              placeholder={`Message ${activeConversation.peer.displayName}...`}
              disabled={isLoadingMessages}
              onTypingStart={() => activeConversationId && emitTypingStart(activeConversationId)}
              onTypingStop={() => activeConversationId && emitTypingStop(activeConversationId)}
            />
          </main>
        ) : (
          <div className="empty-viewport-state">
            <div className="welcome-card">
              <div className="welcome-card-illustration">
                <div className="welcome-laptop">
                  <div className="welcome-laptop-screen">
                    <div className="welcome-screen-lines">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <div className="welcome-screen-badge">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
                      </svg>
                    </div>
                  </div>
                  <div className="welcome-laptop-base"></div>
                </div>
              </div>

              <h2 className="welcome-card-title">Stay connected with Chatterly</h2>
              <p className="welcome-card-subtitle">
                {apiError ? (
                  <span style={{ color: '#ef4444' }}>
                    {apiError}. Make sure Express server is running on http://localhost:3001.
                  </span>
                ) : (
                  'Real-time messaging with instant delivery sync, presence tracking, and clean dark mode.'
                )}
              </p>

              <button
                type="button"
                className="welcome-card-action-btn"
                onClick={() => setIsNewChatModalOpen(true)}
              >
                Start New Chat
              </button>

              <div className="welcome-card-quick-actions">
                <button
                  type="button"
                  className="welcome-quick-action"
                  onClick={() => setIsNewChatModalOpen(true)}
                >
                  <div className="welcome-quick-action-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <span>New chat</span>
                </button>

                <button
                  type="button"
                  className="welcome-quick-action"
                  onClick={() => setIsNewChatModalOpen(true)}
                >
                  <div className="welcome-quick-action-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="8.5" cy="7" r="4"></circle>
                      <line x1="20" y1="8" x2="20" y2="14"></line>
                      <line x1="23" y1="11" x2="17" y2="11"></line>
                    </svg>
                  </div>
                  <span>Add contact</span>
                </button>

                <button
                  type="button"
                  className="welcome-quick-action"
                  onClick={handleToggleTheme}
                >
                  <div className="welcome-quick-action-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"></circle>
                      <line x1="12" y1="1" x2="12" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="23"></line>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                      <line x1="1" y1="12" x2="3" y2="12"></line>
                      <line x1="21" y1="12" x2="23" y2="12"></line>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                  </div>
                  <span>Theme</span>
                </button>
              </div>
            </div>

            <div className="welcome-footer-lock">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onSelectUser={handleSelectUserToChat}
        currentUserId={currentUser.id}
      />
    </div>
  );
};
