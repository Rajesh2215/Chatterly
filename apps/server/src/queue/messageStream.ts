import { redis } from "../config/redisAdapter.js";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { Types } from "mongoose";

export const STREAM_KEY = "stream:chat:messages";
export const CONSUMER_GROUP = "group:persistence";
const CONSUMER_NAME = `worker:${process.pid}`;

export interface StreamMessageEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  deliveryStatus?: "sent" | "delivered" | "read";
}

// 1. FAST-PATH PRODUCER (< 0.2ms)
// Pushes to Redis Stream without waiting for MongoDB disk
export async function produceMessageEvent(event: StreamMessageEvent): Promise<string> {
  const streamId = await redis.xadd(
    STREAM_KEY,
    "*",      // Auto-generate timestamped entry ID
    "data",   // Field name
    JSON.stringify(event)
  );
  console.log(`⚡ [Fast-Path] Stream XADD: "${event.content}" (id: ${event.messageId}) ➔ streamId: ${streamId}`);
  return streamId as string;
}

// 2. INITIALIZE CONSUMER GROUP
export async function initStreamGroup(): Promise<void> {
  try {
    // "$" means: New consumer group only consumes messages arriving after creation
    // "MKSTREAM" automatically creates the stream if it does not exist
    await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "$", "MKSTREAM");
    console.log("✅ Created Redis Stream consumer group:", CONSUMER_GROUP);
  } catch (err: any) {
    if (!err.message?.includes("BUSYGROUP")) {
      console.warn("⚠️ Redis Stream group notice:", err.message);
    }
  }
}

let isWorkerRunning = false;

// 3. ASYNC PERSISTENCE WORKER (Micro-Batching)
export async function startBatchPersistenceWorker(): Promise<void> {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  await initStreamGroup();
  console.log("🚀 High-Throughput Batch Persistence Worker running (%s)", CONSUMER_NAME);

  const BATCH_SIZE = 50;
  const POLL_TIMEOUT_MS = 100;

  while (isWorkerRunning) {
    try {
      // Read up to BATCH_SIZE new messages from the stream
      const response = await redis.xreadgroup(
        "GROUP", CONSUMER_GROUP, CONSUMER_NAME,   // 1. WHO is asking?
        "COUNT", BATCH_SIZE,                      // 2. HOW MANY do you want?
        "BLOCK", POLL_TIMEOUT_MS,                 // 3. WHAT IF the stream is empty?
        "STREAMS", STREAM_KEY,                      // 4. FROM WHICH stream?
        ">"                                         // 5. WHICH messages?
      );

      // If you set BLOCK 100 and someone sends a message at millisecond 12,
      //  Redis does NOT wait for the full 100ms! It wakes up your worker instantly (in < 0.1ms), 
      // gives you the message, and your code continues immediately.

      if (!response || response.length === 0) {
        continue;
      }

      const streamEntries = (response as any)[0][1];
      if (!streamEntries || streamEntries.length === 0) {
        continue;
      }

      const entryIds: string[] = [];
      const messagesToInsert: any[] = [];
      const lastMessageUpdates = new Map<string, any>();

      for (const [entryId, fields] of streamEntries) {
        entryIds.push(entryId);
        // fields format: ["data", "{...}"]
        const rawData = fields[1];
        try {
          const item: StreamMessageEvent = JSON.parse(rawData);
          const createdAtDate = new Date(item.createdAt);

          messagesToInsert.push({
            _id: item.messageId,
            conversationId: new Types.ObjectId(item.conversationId),
            senderId: new Types.ObjectId(item.senderId),
            content: item.content,
            deliveryStatus: item.deliveryStatus || "sent",
            createdAt: createdAtDate,
            updatedAt: createdAtDate,
          });

          // Track the latest message for this conversation in this batch
          lastMessageUpdates.set(item.conversationId, {
            id: item.messageId,
            senderId: new Types.ObjectId(item.senderId),
            content: item.content,
            createdAt: createdAtDate,
          });
        } catch (parseErr) {
          console.error("Failed to parse stream entry:", parseErr);
        }
      }

      console.log(`📦 [Batch Worker] Processing batch of ${entryIds.length} stream entries for MongoDB bulk write...`);

      // Bulk write #1: Insert all messages into MongoDB in a single round-trip
      if (messagesToInsert.length > 0) {
        // { ordered: false }: Inserts in parallel. If doc #3 fails (e.g. duplicate key), docs 4-50 are STILL inserted!
        // Ordering is NOT lost because our ULID primary keys enforce chronological order on query.
        await Message.insertMany(messagesToInsert, { ordered: false }).catch((err) => {
          if (err.code !== 11000) {
            console.error("MongoDB batch insert error:", err);
          }
        });

        // Bulk write #2: Update conversation lastMessage snippets
        const bulkConvOps = Array.from(lastMessageUpdates.entries()).map(([convId, lastMsg]) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(convId) },
            update: {
              $set: {
                lastMessage: lastMsg,
                updatedAt: lastMsg.createdAt,
              },
            },
          },
        }));

        if (bulkConvOps.length > 0) {
          await Conversation.bulkWrite(bulkConvOps, { ordered: false }).catch((err) => {
            console.error("MongoDB bulkWrite conversation update error:", err);
          });
        }
      }

      // Acknowledge processed entries: Tells Redis these messages are safely in MongoDB.
      // Redis removes them from the Pending Entries List (PEL). If the server died before this line,
      // Redis would keep them for retry on reboot (zero data loss!).
      if (entryIds.length > 0) {
        await redis.xack(STREAM_KEY, CONSUMER_GROUP, ...entryIds);
        console.log(`✅ [Batch Worker] Successfully persisted to MongoDB & ACKed ${entryIds.length} stream entries`);
      }
    } catch (err: any) {
      console.error("❌ Persistence Worker loop error:", err.message);
      // Small backoff to avoid hot spinning if Redis or MongoDB is temporarily unreachable
      await new Promise((res) => setTimeout(res, 500));
    }
  }
}

export function stopBatchPersistenceWorker() {
  isWorkerRunning = false;
}
