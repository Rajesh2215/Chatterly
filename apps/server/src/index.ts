import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { redis } from './config/redis.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

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

  app.listen(PORT, () => {
    console.log(`🚀 Chatterly server running on http://localhost:${PORT}`);
  });
}

bootstrap();
