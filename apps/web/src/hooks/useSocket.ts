'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getSocket, disconnectSocket, AppSocket } from '@/lib/socket';
import { MessagePayload, TypingPayload } from '@/lib/socket.types';

interface UseSocketOptions {
  accessToken: string | null;
  activeConversationId: string | null;
  onNewMessage: (msg: MessagePayload) => void;
  onUserTyping: (payload: TypingPayload) => void;
  onUserStopTyping: (payload: TypingPayload) => void;
}

export function useSocket({
  accessToken,
  activeConversationId,
  onNewMessage,
  onUserTyping,
  onUserStopTyping,
}: UseSocketOptions) {
  const socketRef = useRef<AppSocket | null>(null);

  // Connect when we have an access token
  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket(accessToken);
    socketRef.current = socket;

    const handleConnect = () => {
      console.log('🔌 Socket connected:', socket.id);
    };

    socket.on('connect', handleConnect);

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('error', ({ message }) => {
      console.error('Socket error:', message);
    });

    socket.connect();

    // Cleanup on unmount / token change
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('error');
      disconnectSocket();
    };
  }, [accessToken]);

  // Listen for incoming messages
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('new_message', onNewMessage);
    socket.on('user_typing', onUserTyping);
    socket.on('user_stop_typing', onUserStopTyping);

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('user_typing', onUserTyping);
      socket.off('user_stop_typing', onUserStopTyping);
    };
  }, [onNewMessage, onUserTyping, onUserStopTyping]);

  // Expose actions
  const emitSendMessage = useCallback(
    (conversationId: string, content: string) => {
      socketRef.current?.emit('send_message', { conversationId, content });
    },
    []
  );

  const emitTypingStart = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing_start', conversationId);
  }, []);

  const emitTypingStop = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing_stop', conversationId);
  }, []);

  return { emitSendMessage, emitTypingStart, emitTypingStop };
}
