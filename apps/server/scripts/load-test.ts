import { io, Socket } from "socket.io-client";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatterly?replicaSet=rs0&directConnection=true";
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "chatterly_super_secure_access_secret_2026";

// Configurable benchmark options
const PAIRS_COUNT = parseInt(process.argv.find(a => a.startsWith("--pairs="))?.split("=")[1] || "25", 10);
const DURATION_SEC = parseInt(process.argv.find(a => a.startsWith("--duration="))?.split("=")[1] || "10", 10);
const TARGET_RATE = parseInt(process.argv.find(a => a.startsWith("--rate="))?.split("=")[1] || "500", 10); // msgs / sec

interface ClientPair {
  id: number;
  senderId: string;
  receiverId: string;
  conversationId: string;
  senderSocket: Socket;
  receiverSocket: Socket;
}

function generateToken(userId: string, username: string): string {
  return jwt.sign(
    { userId, username, email: `${username}@bench.test` },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function prepareBenchmarkEntities(pairsCount: number): Promise<Array<{ senderId: string; receiverId: string; conversationId: string }>> {
  console.log("🛠️  Preparing benchmark test conversations in MongoDB...");
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db!;
  const convColl = db.collection("conversations");
  const userColl = db.collection("users");

  const pairsData: Array<{ senderId: string; receiverId: string; conversationId: string }> = [];

  for (let i = 0; i < pairsCount; i++) {
    const senderUsername = `bench_sender_${i}`;
    const receiverUsername = `bench_receiver_${i}`;

    // Upsert test users
    const sender = await userColl.findOneAndUpdate(
      { username: senderUsername },
      { $setOnInsert: { displayName: `Bench Sender ${i}`, email: `${senderUsername}@test.com`, passwordHash: "dummy" } },
      { upsert: true, returnDocument: "after" }
    );

    const receiver = await userColl.findOneAndUpdate(
      { username: receiverUsername },
      { $setOnInsert: { displayName: `Bench Receiver ${i}`, email: `${receiverUsername}@test.com`, passwordHash: "dummy" } },
      { upsert: true, returnDocument: "after" }
    );

    const sId = (sender?._id || sender?.value?._id)!.toString();
    const rId = (receiver?._id || receiver?.value?._id)!.toString();

    // Find or create conversation
    let conv = await convColl.findOne({
      type: "direct",
      participants: { $all: [new Types.ObjectId(sId), new Types.ObjectId(rId)] },
    });

    if (!conv) {
      const insertRes = await convColl.insertOne({
        type: "direct",
        participants: [new Types.ObjectId(sId), new Types.ObjectId(rId)],
        adminIds: [],
        updatedAt: new Date(),
        createdAt: new Date(),
      });
      conv = { _id: insertRes.insertedId } as any;
    }

    const cId = conv._id.toString();
    pairsData.push({ senderId: sId, receiverId: rId, conversationId: cId });
  }

  await mongoose.disconnect();
  console.log(`✅ Verified ${pairsCount} benchmark conversations in MongoDB.`);
  return pairsData;
}

async function runBenchmark() {
  console.log("=================================================================");
  console.log("🚀  CHATTERLY REAL-TIME GATEWAY BENCHMARK & LOAD TEST  🚀");
  console.log("=================================================================");
  console.log(`Server URL:      ${SERVER_URL}`);
  console.log(`Client Pairs:    ${PAIRS_COUNT} (${PAIRS_COUNT * 2} concurrent WebSockets)`);
  console.log(`Target Rate:     ${TARGET_RATE} msgs/sec`);
  console.log(`Duration:        ${DURATION_SEC} seconds`);
  console.log("-----------------------------------------------------------------");

  const entities = await prepareBenchmarkEntities(PAIRS_COUNT);

  console.log(`🔌 Connecting ${PAIRS_COUNT * 2} WebSocket clients...`);

  const latencies: number[] = [];
  let totalSent = 0;
  let totalReceived = 0;

  const pairs: ClientPair[] = [];

  // Connect all sockets
  await Promise.all(
    entities.map(async (data, i) => {
      const senderToken = generateToken(data.senderId, `bench_sender_${i}`);
      const receiverToken = generateToken(data.receiverId, `bench_receiver_${i}`);

      const senderSocket = io(SERVER_URL, {
        auth: { token: senderToken },
        transports: ["websocket"],
        forceNew: true,
      });

      const receiverSocket = io(SERVER_URL, {
        auth: { token: receiverToken },
        transports: ["websocket"],
        forceNew: true,
      });

      await Promise.all([
        new Promise<void>((resolve) => senderSocket.on("connect", () => resolve())),
        new Promise<void>((resolve) => receiverSocket.on("connect", () => resolve())),
      ]);

      // Set up receiver listener
      receiverSocket.on("new_message", (payload: any) => {
        try {
          const meta = JSON.parse(payload.content);
          if (meta.t0) {
            const latency = performance.now() - meta.t0;
            latencies.push(latency);
            totalReceived++;
          }
        } catch {
          // not a benchmark JSON message
        }
      });

      pairs.push({
        id: i,
        senderId: data.senderId,
        receiverId: data.receiverId,
        conversationId: data.conversationId,
        senderSocket,
        receiverSocket,
      });
    })
  );

  console.log(`🟢 All ${pairs.length * 2} WebSocket clients connected and listening!`);
  console.log("🔥 Starting message flood in 1 second...");
  await new Promise((res) => setTimeout(res, 1000));

  const startTime = performance.now();
  const intervalMs = 1000 / TARGET_RATE; // Interval between messages

  let isRunning = true;
  let pairIndex = 0;

  // Firing loop
  const timer = setInterval(() => {
    if (!isRunning) return;

    const pair = pairs[pairIndex % pairs.length];
    pairIndex++;

    const t0 = performance.now();
    const content = JSON.stringify({ t0, seq: totalSent });

    pair.senderSocket.emit("send_message", {
      conversationId: pair.conversationId,
      content,
    });
    totalSent++;
  }, intervalMs);

  // Status ticker
  const ticker = setInterval(() => {
    const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
    const currentRate = (totalSent / parseFloat(elapsedSec)).toFixed(0);
    const avgLatency = latencies.length > 0
      ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
      : "0";

    process.stdout.write(
      `\r⏱️  Elapsed: ${elapsedSec}s / ${DURATION_SEC}s | Sent: ${totalSent} | Received: ${totalReceived} | Rate: ${currentRate} msg/s | Avg Latency: ${avgLatency}ms`
    );
  }, 500);

  // Wait for test duration
  await new Promise((res) => setTimeout(res, DURATION_SEC * 1000));

  isRunning = false;
  clearInterval(timer);
  clearInterval(ticker);

  console.log("\n\n⏳ Waiting 2 seconds for in-flight packets to settle...");
  await new Promise((res) => setTimeout(res, 2000));

  // Disconnect all sockets
  pairs.forEach((p) => {
    p.senderSocket.disconnect();
    p.receiverSocket.disconnect();
  });

  const totalTimeSec = (performance.now() - startTime) / 1000;

  // Compute statistics
  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  const p50 = count > 0 ? latencies[Math.floor(count * 0.5)].toFixed(2) : "N/A";
  const p90 = count > 0 ? latencies[Math.floor(count * 0.9)].toFixed(2) : "N/A";
  const p95 = count > 0 ? latencies[Math.floor(count * 0.95)].toFixed(2) : "N/A";
  const p99 = count > 0 ? latencies[Math.floor(count * 0.99)].toFixed(2) : "N/A";
  const min = count > 0 ? latencies[0].toFixed(2) : "N/A";
  const max = count > 0 ? latencies[count - 1].toFixed(2) : "N/A";
  const avg = count > 0 ? (latencies.reduce((a, b) => a + b, 0) / count).toFixed(2) : "N/A";
  const throughput = (totalReceived / totalTimeSec).toFixed(1);
  const lossRate = totalSent > 0 ? (((totalSent - totalReceived) / totalSent) * 100).toFixed(2) : "0.00";

  console.log("=================================================================");
  console.log("📊  BENCHMARK RESULTS REPORT");
  console.log("=================================================================");
  console.log(`Total Messages Sent:        ${totalSent}`);
  console.log(`Total Messages Received:    ${totalReceived}`);
  console.log(`Delivery Success Rate:      ${(100 - parseFloat(lossRate)).toFixed(2)}% (Loss: ${lossRate}%)`);
  console.log(`Sustained Throughput:       ${throughput} msgs / second`);
  console.log("-----------------------------------------------------------------");
  console.log(`Latency Min:                ${min} ms`);
  console.log(`Latency Average:            ${avg} ms`);
  console.log(`Latency p50 (Median):       ${p50} ms`);
  console.log(`Latency p90:                ${p90} ms`);
  console.log(`Latency p95:                ${p95} ms`);
  console.log(`Latency p99 (Tail):         ${p99} ms`);
  console.log(`Latency Max:                ${max} ms`);
  console.log("=================================================================");
  if (parseFloat(p99) < 25) {
    console.log("🏆 GRADE: A+ — High-performance sub-25ms real-time gateway!");
  } else if (parseFloat(p99) < 50) {
    console.log("✅ GRADE: A  — Production-grade low latency gateway.");
  } else {
    console.log("⚠️ GRADE: B  — Acceptable, but room for event loop optimization.");
  }
  console.log("=================================================================\n");

  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("❌ Benchmark failed:", err);
  process.exit(1);
});
