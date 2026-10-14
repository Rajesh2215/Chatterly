import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { redis } from './config/redis.js';
import { apiRouter } from './routes/index.js';
import cookieParser from 'cookie-parser';
import { createSocketServer } from './socket/socket.server.js';

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


async function bootstrap() {
  await connectDB();
  // Wrap Express app in a raw Node http.Server
  // Socket.io attaches to the http server, NOT the express app directly
  const httpServer = http.createServer(app);
  createSocketServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`🚀 Chatterly server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.io ready`);
  });
}
bootstrap();
