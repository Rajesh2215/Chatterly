'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { MessagePayload, TypingPayload } from '@/lib/socket.types';
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

  //Socket: incoming real-time message
  const handleNewMessage = useCallback(
    (msg: MessagePayload) => {
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

          return {
            ...conv,
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
    []
  );

  // Socket: typing indicators
  const handleUserTyping = useCallback((payload: TypingPayload) => {
    if (payload.userId === currentUserId) return; // ignore self
    setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.username }));
  }, [currentUserId]);

  const handleUserStopTyping = useCallback((payload: TypingPayload) => {
    setTypingUsers((prev) => {
      const next = { ...prev };
      delete next[payload.userId];
      return next;
    });
  }, []);

  const { emitSendMessage, emitTypingStart, emitTypingStop } = useSocket({
    accessToken: getAccessToken(),
    activeConversationId,
    onNewMessage: handleNewMessage,
    onUserTyping: handleUserTyping,
    onUserStopTyping: handleUserStopTyping,
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

        if (uiConvs.length > 0) {
          const defaultConvId = uiConvs[0].id;
          setActiveConversationId(defaultConvId);
          await fetchMessagesForConversation(defaultConvId);
        } else {
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

    // If conversation messages are not loaded yet, fetch from server
    const existing = conversations.find((c) => c.id === id);
    if (!existing || existing.messages.length === 0) {
      await fetchMessagesForConversation(id);
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
            <div className="empty-viewport-icon">⚡</div>
            <h2 className="empty-viewport-title">Chatterly Web</h2>
            <p className="empty-viewport-subtitle">
              {apiError ? (
                <span style={{ color: '#ef4444' }}>
                  {apiError}. Make sure Express server is running on http://localhost:3001.
                </span>
              ) : (
                'Select a conversation or switch user to start messaging with real-time Express & MongoDB data.'
              )}
            </p>
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
