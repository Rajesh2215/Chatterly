import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ulid } from 'ulid';
import { Message } from '../models/Message.js';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
  MessagePayload,
} from './socket.types.js';
import { Conversation } from '../models/Conversation.js';

// Typed socket alias for convenience
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true, // allow cookies
      },
    }
  );

  // Auth Middleware 
  // Runs before every connection. Verifies the access token sent in the
  // socket handshake. If invalid → socket is rejected with a 401 error.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const secret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret_chatterly';
      const decoded = jwt.verify(token, secret) as {
        userId: string;
        username: string;
        email: string;
      };

      // Attach user data to the socket object — accessible in all event handlers
      socket.data.userId = decoded.userId;
      socket.data.username = decoded.username;
      socket.data.email = decoded.email;

      next(); // allow connection
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // Connection Handler 
  io.on('connection', (socket: AppSocket) => {
    console.log(`🔌 Socket connected: ${socket.data.username} (${socket.id})`);

    const userRoom = `user:${socket.data.userId}`;
    socket.join(userRoom);
    console.log(`🔌 ${socket.data.username} joined their room: ${userRoom}`);

    // Send a message 
    // 1. Save to MongoDB
    // 2. Broadcast to everyone else in the room
    socket.on('send_message', async ({ conversationId, content }) => {
      if (!content?.trim()) return;

      try {
        // Persist to DB (same model as HTTP route)
        const message = await Message.create({
          _id: ulid(),
          conversationId,
          senderId: socket.data.userId,
          content: content.trim(),
          deliveryStatus: 'sent',
        });

        const payload: MessagePayload = {
          _id: message._id as string,
          conversationId,
          senderId: socket.data.userId,
          content: message.content,
          deliveryStatus: 'sent',
          createdAt: (message as any).createdAt?.toISOString?.() || new Date().toISOString(),
        };

        const conversation = await Conversation.findById(conversationId)
        if (!conversation) return

        conversation.participants.forEach((participantId) => {
          io.to(`user:${participantId}`).emit('new_message', payload)
        })


      } catch (err) {
        console.error('send_message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators 
    // Broadcast to everyone EXCEPT the sender
    socket.on('typing_start', async (conversationId: string) => {
      const conversation = await Conversation.findById(conversationId)
      if (!conversation) return

      conversation.participants.forEach((participantId) => {
        socket.to(`user:${participantId}`).emit('user_typing', {
          conversationId,
          userId: socket.data.userId,
          username: socket.data.username,
        });
      })

    });

    socket.on('typing_stop', async (conversationId: string) => {
      const conversation = await Conversation.findById(conversationId)
      if (!conversation) return

      conversation.participants.forEach((participantId) => {
        socket.to(`user:${participantId}`).emit('user_stop_typing', {
          conversationId,
          userId: socket.data.userId,
          username: socket.data.username,
        });
      })
    });

    // Disconnect 
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.data.username} — ${reason}`);
    });
  });

  return io;
}
