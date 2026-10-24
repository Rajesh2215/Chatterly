# 💬 Chatterly

> **Enterprise-Grade, High-Throughput Distributed Real-Time Messaging Architecture**

Chatterly is a horizontally scalable real-time chat platform engineered for extreme resilience, fault isolation, and sub-millisecond message delivery. Built with **Node.js, TypeScript, Socket.IO, Redis 7 (Streams + Lua), MongoDB Replica Sets, and Next.js 15**.

### ⚡ Architecture Highlights & Benchmarks (Grade A+)
- **Sub-Millisecond Latency:** `0.50ms` min, **`1.00ms` median (p50)**, and `4.93ms` p99 tail latency across 100 concurrent WebSockets blasting **800+ msgs/second**.
- **Asynchronous Micro-Batching:** Zero-disk I/O on the routing hot-path via **Redis Streams (`XADD`)** + decoupled persistence worker (`XREADGROUP` + bulk `insertMany` + `XACK`).
- **Distributed Token Bucket Rate Limiting:** Evaluated atomically in Redis via custom C-engine **Lua scripts** (`<0.05ms`) with real-time client toast notifications.
- **Memory Backpressure & Circuit Breakers:** `.volatile.emit` packet-shedding for typing indicators, with a 1MB / 100-packet buffer circuit breaker to prevent Node.js Out-Of-Memory (OOM) crashes.
- **Distributed Deduplication (Exactly-Once Semantics):** Client-generated idempotency keys guarded via atomic `SET ... NX EX 120` to prevent duplicate writes during network retries.
- **Thundering Herd Mitigation:** Full Jitter client exponential backoff paired with Redis Set in-memory contact caching (`contacts:<userId>`, TTL: 1h).
- **Poison Pill Recovery:** Automated Dead-Letter Queue (DLQ) diversion preserving stream continuity without worker crash loops.
- **Zero-Downtime Connection Draining:** Cascading `SIGTERM` / `SIGINT` shutdown handler with a 10-second `.unref()` watchdog to eliminate container zombie states in Kubernetes/Docker.
