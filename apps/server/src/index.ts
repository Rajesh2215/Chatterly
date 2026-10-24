import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { pubClient, redis, subClient } from './config/redisAdapter.js';
import { apiRouter } from './routes/index.js';
import cookieParser from 'cookie-parser';
import { createSocketServer } from './socket/socket.server.js';
import { startBatchPersistenceWorker, stopBatchPersistenceWorker } from './queue/messageStream.js';
import type { Server as SocketIOServer } from 'socket.io';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api', apiRouter);

// Upgraded Health Check: Pings both Mongo & Redis
app.get('/health', async (req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';

  let redisState = 'unhealthy';
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') redisState = 'healthy';
  } catch {
    redisState = 'unhealthy';
  }

  const isHealthy = mongoState === 'healthy' && redisState === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    services: {
      mongodb: mongoState,
      redis: redisState,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const ROLE = process.env.PROCESS_ROLE || 'all'; // 'all' | 'gateway' | 'worker'

let httpServer: http.Server | null = null;
let io: SocketIOServer | null = null;
let isShuttingDown = false; // 👈 Prevents duplicate execution on multiple Ctrl+C

async function bootstrap() {
  await connectDB();

  // 1. WORKER ONLY (Headless - No HTTP/WebSockets)
  if (ROLE === 'worker') {
    console.log('👷 Running in WORKER mode (Persistence worker only)');
    await startBatchPersistenceWorker();
    return;
  }

  // 2. GATEWAY & API (Express + Socket.io)
  httpServer = http.createServer(app);
  io = createSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Chatterly Gateway & API running on port ${PORT}`);
    console.log(`🔌 Socket.io ready (${ROLE} mode)`);
  });

  // 3. IF 'all', also run the worker in the background of this process
  if (ROLE === 'all') {
    console.log('📦 Running integrated persistence worker in-process');
    await startBatchPersistenceWorker();
  }
}

// Graceful Shutdown & Connection Draining
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 [Shutdown] Received ${signal}. Draining connections cleanly...`);

  // Safety Watchdog: Force exit if draining hangs longer than 10 seconds
  const forceExitTimeout = setTimeout(() => {
    console.error('⚠️ [Shutdown] Draining exceeded 10s deadline. Forcing exit (code 1)...');
    process.exit(1)
  }, 10000)

  forceExitTimeout.unref();

  try {

    const shutdownTasks: Promise<any>[] = [];

    if (ROLE === 'worker' || ROLE === 'all') {
      console.log('👷 [Shutdown] Halting message stream worker loop...');
      stopBatchPersistenceWorker();
    }

    // Close Socket.IO server & HTTP server
    if (io) {
      console.log('🔌 [Shutdown] Closing Socket.IO server & disconnecting clients...');
      shutdownTasks.push(new Promise<void>((res) => io!.close(() => res())));
    }

    if (httpServer) {
      console.log('🛑 [Shutdown] Closing HTTP server listener...');
      shutdownTasks.push(new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => (err ? reject(err) : resolve()));
      }));
    }

    // Await network listener teardown first
    await Promise.allSettled(shutdownTasks);

    // Close MongoDB Connection
    if (mongoose.connection.readyState !== 0) {
      console.log('🍃 [Shutdown] Closing MongoDB connection pool...');
      await mongoose.disconnect()
    }

    // Close Redis Client Connections
    console.log('⚡ [Shutdown] Closing Redis connection clients...');
    await Promise.allSettled([
      redis.quit(),
      pubClient.quit(),
      subClient.quit(),
    ]);

    clearTimeout(forceExitTimeout);

    console.log('✅ [Shutdown] Clean shutdown completed. System offline safely.');
    process.exit(0);

  } catch (error) {
    console.error('❌ [Shutdown] Error during graceful shutdown:', error);
    process.exit(1);
  }

}

// SIGINT (Signal Interrupt): Triggered when you press Ctrl + C in your local terminal.
// SIGTERM (Signal Terminate): Sent by Kubernetes, Docker (docker stop), systemd, or cloud load

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));


bootstrap();
