import { Types } from 'mongoose';
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
import { User } from '../models/User.js';
import { getSocketRedisAdapter } from '../config/redisAdapter.js';

// Typed socket alias for convenience
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

// Helper function to find all unique contact IDs for a user
async function getContactIds(userId: string): Promise<string[]> {
  const conversations = await Conversation.find({ participants: userId }).select('participants');
  const contacts = new Set<string>();
  conversations.forEach((c) => {
    c.participants.forEach((p) => {
      const pid = p.toString();
      if (pid !== userId) contacts.add(pid);
    });
  });
  return Array.from(contacts);
}


export function createSocketServer(httpServer: HttpServer): SocketIOServer {

  // Map: userId -> active socket count
  const onlineUsers = new Map<string, number>();


  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true, // allow cookies
      },
    }
  );

  io.adapter(getSocketRedisAdapter());

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
  io.on('connection', async (socket: AppSocket) => {
    console.log(`🔌 Socket connected: ${socket.data.username} (${socket.id})`);

    const userId = socket.data.userId;
    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    console.log(`🔌 ${socket.data.username} joined their room: ${userRoom}`);

    // Track active sockets for this user
    const currentCount = onlineUsers.get(userId) || 0;
    onlineUsers.set(userId, currentCount + 1);

    const contacts = await getContactIds(userId);

    // If first socket connection, broadcast: User is now ONLINE 🟢
    if (currentCount === 0) {
      contacts.forEach((contactId) => {
        io.to(`user:${contactId}`).emit('user_presence', {
          userId,
          status: 'online',
        });
      });

      // Deliver messages sent to this user while they were offline
      try {
        const userConversations = await Conversation.find({
          participants: new Types.ObjectId(userId),
        }).select('_id');

        const convIds = userConversations.map((c) => c._id);
        if (convIds.length > 0) {
          const pendingMessages = await Message.find({
            conversationId: { $in: convIds },
            senderId: { $ne: new Types.ObjectId(userId) },
            deliveryStatus: 'sent',
          });

          if (pendingMessages.length > 0) {
            await Message.updateMany(
              { _id: { $in: pendingMessages.map((m) => m._id) } },
              { $set: { deliveryStatus: 'delivered' } }
            );

            // Notify each sender that their messages are now delivered (✓✓)
            const notifyMap = new Map<string, Set<string>>();
            pendingMessages.forEach((m) => {
              const sId = String(m.senderId);
              const cId = String(m.conversationId);
              if (!notifyMap.has(sId)) notifyMap.set(sId, new Set());
              notifyMap.get(sId)!.add(cId);
            });

            notifyMap.forEach((convSet, senderId) => {
              convSet.forEach((conversationId) => {
                io.to(`user:${senderId}`).emit('message_status', {
                  conversationId,
                  status: 'delivered',
                  senderId,
                });
              });
            });
          }
        }
      } catch (err) {
        console.error('Error marking offline messages delivered:', err);
      }
    }

    // Send this socket the list of their contacts who are currently online
    const onlineContacts = contacts.filter((id) => (onlineUsers.get(id) || 0) > 0);
    socket.emit('initial_presence', onlineContacts);

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

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        conversation.lastMessage = {
          id: message._id as string,
          senderId: socket.data.userId as any,
          content: message.content,
          createdAt: (message as any).createdAt || new Date(),
        };
        await conversation.save();

        conversation.participants.forEach((participantId) => {
          io.to(`user:${participantId.toString()}`).emit('new_message', payload);
        });


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
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.data.username} — ${reason}`);

      const count = onlineUsers.get(userId) || 1;
      if (count <= 1) {
        onlineUsers.delete(userId);
        const lastSeenAt = new Date();

        // 1. Save lastSeenAt in MongoDB
        try {
          await User.findByIdAndUpdate(userId, { lastSeenAt });
        } catch (err) {
          console.error('Failed to update lastSeenAt:', err);
        }

        const contacts = await getContactIds(userId);
        // Notify ONLY their contacts:
        contacts.forEach((contactId) => {
          io.to(`user:${contactId}`).emit('user_presence', {
            userId,
            status: 'offline',
            lastSeenAt: lastSeenAt.toISOString(),
          });
        });
      } else {
        onlineUsers.set(userId, count - 1);
      }
    });


    // Listen for message status updates (delivered / read)
    socket.on('message_status', async (payload) => {
      try {
        const { conversationId, messageId, senderId, status } = payload;

        // 1. Update in MongoDB
        if (messageId) {
          await Message.findByIdAndUpdate(messageId, { deliveryStatus: status });
        } else if (status === 'read') {
          // If no messageId, mark all unread messages from this sender as 'read'
          await Message.updateMany(
            { conversationId, senderId, deliveryStatus: { $ne: 'read' } },
            { deliveryStatus: 'read' }
          );
        }

        // 2. Forward to the original sender's personal room
        io.to(`user:${senderId}`).emit('message_status', payload);
      } catch (err) {
        console.error('Error updating message status:', err);
      }
    });

  });

  return io;
}
