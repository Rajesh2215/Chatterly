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
import { setCurrentUser as setAuthUser, clearAuth } from '@/lib/auth';
import {
  formatConversationTime,
  formatMessageTime,
  transformApiConversationToUi,
  transformApiMessageToUi,
} from '@/lib/transformers';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface ChatShellProps {
  initialTheme?: ThemeMode;
}

// Default initial user ID (Alex Rivera's MongoDB ID) - only used as fallback before auth loads
const FALLBACK_USER: UserProfile = {
  id: '',
  name: '',
  displayName: 'Loading...',
  status: 'online',
};

export const ChatShell: React.FC<ChatShellProps> = ({ initialTheme = 'dark' }) => {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUserState] = useState<UserProfile>(FALLBACK_USER);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  const [availablePeers, setAvailablePeers] = useState<{ id: string; displayName: string; name: string }[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

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
    restoreSession();
  }, [router]);

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

        // Discover user profile & other available participants from DB data
        const discoveredPeers: Map<string, { id: string; displayName: string; name: string }> = new Map();
        let foundUserProfile: UserProfile | null = null;

        for (const conv of apiConvs) {
          for (const p of conv.participants) {
            if (String(p._id) === userId) {
              foundUserProfile = {
                id: String(p._id),
                name: p.username,
                displayName: p.displayName || p.username,
                avatarUrl: p.avatarUrl,
                status: 'online',
                customStatus: p.statusText || 'Active',
              };
            } else {
              discoveredPeers.set(String(p._id), {
                id: String(p._id),
                displayName: p.displayName || p.username,
                name: p.username,
              });
            }
          }
        }

        if (foundUserProfile) {
          setCurrentUserState(foundUserProfile);
        } else {
          setCurrentUserState({
            id: userId,
            name: `user_${userId.slice(-4)}`,
            displayName: `User (${userId.slice(-6)})`,
            status: 'online',
          });
        }

        setAvailablePeers(Array.from(discoveredPeers.values()));

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
    } catch {/* ignore */} finally {
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

      // 3. Fire POST /api/conversations/:id/messages
      try {
        const confirmedApiMsg = await sendMessage(activeConversationId, {
          senderId: currentUser.id,
          content: text,
        });

        const confirmedUiMsg = transformApiMessageToUi(confirmedApiMsg);

        // 4. Replace temporary message with confirmed ULID message from server
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConversationId) {
              const updatedMessages = conv.messages.map((m) =>
                m.id === tempId ? confirmedUiMsg : m
              );
              return {
                ...conv,
                messages: updatedMessages,
                lastMessage: {
                  id: confirmedApiMsg._id,
                  content: confirmedApiMsg.content,
                  timestamp: formatConversationTime(confirmedApiMsg.createdAt),
                  senderId: currentUser.id,
                  status: 'sent',
                },
              };
            }
            return conv;
          })
        );
      } catch (err: any) {
        console.error('Failed to send message:', err);
        // Mark message as failed
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConversationId) {
              const updatedMessages = conv.messages.map((m) =>
                m.id === tempId ? { ...m, status: 'pending' as const } : m
              );
              return {
                ...conv,
                messages: updatedMessages,
              };
            }
            return conv;
          })
        );
      }
    },
    [activeConversationId, currentUser.id]
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
          onNewChat={() => loadUserConversations(currentUserId)}
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
              disabled={isLoadingMessages}
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
    </div>
  );
};
