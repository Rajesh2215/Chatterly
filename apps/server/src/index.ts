import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { redis } from './config/redisAdapter.js';
import { apiRouter } from './routes/index.js';
import cookieParser from 'cookie-parser';
import { createSocketServer } from './socket/socket.server.js';
import { startBatchPersistenceWorker } from './queue/messageStream.js';

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

async function bootstrap() {
  await connectDB();

  // 1. WORKER ONLY (Headless - No HTTP/WebSockets)
  if (ROLE === 'worker') {
    console.log('👷 Running in WORKER mode (Persistence worker only)');
    await startBatchPersistenceWorker();
    return;
  }

  // 2. GATEWAY & API (Express + Socket.io)
  const httpServer = http.createServer(app);
  createSocketServer(httpServer);

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

bootstrap();
