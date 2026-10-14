import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './socket.types';

// Typed socket alias
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let socket: AppSocket | null = null;

/**
 * Returns the singleton socket. Creates it the first time it's called.
 * Pass the current access token so the server can authenticate the handshake.
 */
export function getSocket(accessToken: string): AppSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      autoConnect: false,
    });
  } else {
    socket.auth = { token: accessToken };
  }
  return socket;
}

/**
 * Disconnect and destroy the socket.
 * Call this on logout.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
