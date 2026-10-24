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
import { getSocketRedisAdapter, redis } from '../config/redisAdapter.js';
import { produceMessageEvent } from '../queue/messageStream.js';
import { presenceService } from '../services/presence.service.js';
import { unreadService } from '../services/unread.service.js';
import { rateLimiter } from '../services/rateLimiter.service.js';

// Typed socket alias for convenience
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

// Helper function to find all unique contact IDs for a user
async function getContactIds(userId: string): Promise<string[]> {

  const cacheKey = `contacts:${userId}`

  let contacts = await redis.smembers(cacheKey)

  if (!contacts || contacts.length === 0) {

    const conversations = await Conversation.find({ participants: userId }).select('participants');
    const contactSet = new Set<string>();
    conversations.forEach((c) => {
      c.participants.forEach((p) => {
        const pid = p.toString();
        if (pid !== userId) contactSet.add(pid);
      });
    });

    contacts = Array.from(contactSet);

    if (contacts.length > 0) {
      await redis.sadd(cacheKey, ...contacts);
      await redis.expire(cacheKey, 3600); // 1-hour TTL
    }

  }

  return contacts
}

// Helper to get conversation participants with Redis caching
async function getConversationParticipants(conversationId: string): Promise<string[]> {
  const cacheKey = `conv:${conversationId}:participants`;

  // 1. Try Redis Set first (0.05ms)
  let participants = await redis.smembers(cacheKey);

  // 2. Cold-Cache Fallback: Read MongoDB once and populate Redis
  if (!participants || participants.length === 0) {
    const conv = await Conversation.findById(conversationId).select('participants');
    if (!conv) return [];

    participants = conv.participants.map((p) => p.toString());

    if (participants.length > 0) {
      await redis.sadd(cacheKey, ...participants);
      await redis.expire(cacheKey, 86400); // 24-hour TTL
    }
  }

  return participants;
}

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
    // const currentCount = onlineUsers.get(userId) || 0;
    // onlineUsers.set(userId, currentCount + 1);

    const connectionCount = await presenceService.userConnected(userId);

    const contacts = await getContactIds(userId);

    // If first socket connection, broadcast: User is now ONLINE 🟢
    if (connectionCount === 1) {
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

    // Send this socket the list of their contacts who are currently online (from Redis)
    const onlineContacts = await presenceService.getOnlineContacts(contacts);
    socket.emit('initial_presence', onlineContacts);

    // Send a message 
    // 1. Save to MongoDB
    // 2. Broadcast to everyone else in the room
    socket.on('send_message', async ({ conversationId, content }) => {

      // 🛡️ 1. Distributed Token-Bucket Rate Limiting (Redis Lua: <0.05ms)
      // Capacity = 5 burst tokens, refills at 2 tokens/sec
      const rateLimit = await rateLimiter.consume(userId, 12, 3);
      if (!rateLimit.allowed) {
        socket.emit('error', {
          message: 'You are sending messages too fast. Please slow down.',
        });
        return; // Reject before touching Redis Stream or MongoDB!
      }
      if (!content?.trim()) return;

      try {
        console.log(`📨 [Socket Gateway] Incoming message from ${socket.data.username} in conv ${conversationId}`);

        const messageId = ulid();
        const nowIso = new Date().toISOString();

        const payload: MessagePayload = {
          _id: messageId,
          conversationId,
          senderId: socket.data.userId,
          content: content.trim(),
          deliveryStatus: 'sent',
          createdAt: nowIso,
        };

        // 1. FAST-PATH: Push to Redis Stream in <0.2ms (No disk blocking!)
        await produceMessageEvent({
          messageId,
          conversationId,
          senderId: socket.data.userId,
          content: content.trim(),
          createdAt: nowIso,
          deliveryStatus: 'sent',
        });

        // 2. Fetch participants to route WebSocket packets

        const participants = await getConversationParticipants(conversationId);

        participants.forEach((participantId) => {
          const pid = participantId.toString();
          io.to(`user:${pid}`).emit('new_message', payload);

          // If this participant is not the sender, increment their unread count in Redis in 0.05ms
          if (pid !== socket.data.userId) {
            unreadService.incrementUnread(pid, conversationId);
          }
        });

      } catch (err) {
        console.error('send_message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators 
    // Broadcast to everyone EXCEPT the sender

    socket.on('typing_start', async (conversationId: string) => {

      const participants = await getConversationParticipants(conversationId);
      // ✍️ Typing start — shedding packets if recipient is lagging
      participants.forEach((participantId) => {
        socket.to(`user:${participantId}`).volatile.emit('user_typing', {
          conversationId,
          userId: socket.data.userId,
          username: socket.data.username,
        });
      })

    });

    // ✍️ Typing stop — shedding packets if recipient is lagging
    socket.on('typing_stop', async (conversationId: string) => {
      const participants = await getConversationParticipants(conversationId);

      participants.forEach((participantId) => {
        socket.to(`user:${participantId}`).volatile.emit('user_stop_typing', {
          conversationId,
          userId: socket.data.userId,
          username: socket.data.username,
        });
      })
    });

    // 🛡️ Slow Consumer Protection: Disconnect zombie/frozen sockets before OOM crash
    // 64KB threshold for testing (in production: 1MB = 1024 * 1024)
    const MAX_BUFFERED_BYTES = 1024 * 1024; // 1 MB
    const MAX_QUEUE_SIZE = 100;             // Max 100 queued packets in V8 heap

    const backpressureInterval = setInterval(() => {
      // 1. Check raw TCP socket buffer in 'ws'
      const rawWs = (socket.conn as any).transport?.socket;
      const tcpBufferedBytes = rawWs?.bufferedAmount || 0;

      // 2. Check Engine.io packet queue
      const engineQueueLen = (socket.conn as any).writeBuffer?.length || 0;

      // If client has more than 64KB of unsent data accumulated in RAM:
      if (tcpBufferedBytes > MAX_BUFFERED_BYTES || engineQueueLen > MAX_QUEUE_SIZE) {
        console.warn(
          `⚠️ [Backpressure] Client ${socket.data.username} (${socket.id}) is severely lagging (${tcpBufferedBytes} bytes buffered, ${engineQueueLen} queued). Disconnecting to protect server memory.`
        );
        socket.disconnect(true);
      }
    }, 5000);

    // Disconnect 
    socket.on('disconnect', async (reason) => {

      clearInterval(backpressureInterval);
      console.log(`🔌 Socket disconnected: ${socket.data.username} — ${reason}`);

      // Atomically decrement connection count in Redis
      const remaining = await presenceService.userDisconnected(userId);

      // If 0, user closed all devices/tabs!
      if (remaining <= 0) {
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
      }
    });


    // Listen for message status updates (delivered / read)
    socket.on('message_status', async (payload) => {
      try {
        const { conversationId, messageId, senderId, status } = payload;

        // 1. Update MongoDB
        if (messageId) {
          await Message.findByIdAndUpdate(messageId, { deliveryStatus: status });
        } else if (status === 'read') {
          await Message.updateMany(
            { conversationId, senderId, deliveryStatus: { $ne: 'read' } },
            { deliveryStatus: 'read' }
          );
        }

        // 2. Clear Redis unread counter whenever this user reads the conversation
        if (status === 'read') {
          await unreadService.clearUnread(socket.data.userId, conversationId);
        }

        // 3. Forward receipt to the original sender
        io.to(`user:${senderId}`).emit('message_status', payload);
      } catch (err) {
        console.error('Error updating message status:', err);
      }
    });

  });

  return io;
}
