# Design Decisions & Reasoning

> **Project:** RedisLink — URL Shortener
> **Last Updated:** 2026-04-01

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture Pattern](#2-architecture-pattern)
3. [URL Encoding Strategy](#3-url-encoding-strategy)
4. [Database Design](#4-database-design)
5. [Caching Strategy](#5-caching-strategy)
6. [API Design](#6-api-design)
7. [Rate Limiting](#7-rate-limiting)
8. [Input Validation & Sanitization](#8-input-validation--sanitization)
9. [Error Handling](#9-error-handling)
10. [Bulk Processing](#10-bulk-processing)
11. [Graceful Shutdown](#11-graceful-shutdown)
12. [Authentication](#12-authentication)
13. [Trade-offs & Known Limitations](#13-trade-offs--known-limitations)

---

## 1. Tech Stack

### Node.js + Express.js

**Decision:** Use Node.js as the runtime with Express.js as the HTTP framework.

**Reasoning:**
- URL shortening is an I/O-bound workload (DB reads, cache lookups, redirects). Node.js's non-blocking event loop is well-suited for this — it handles high concurrency without spawning threads.
- Express.js is minimal and unopinionated, giving full control over the middleware chain without forcing conventions that don't fit the problem.
- The ecosystem (Mongoose, Redis client, Nanoid, Helmet) is mature and well-maintained.

### MongoDB

**Decision:** Use MongoDB as the primary data store via Mongoose.

**Reasoning:**
- URL records have a flat, predictable shape. MongoDB's document model fits naturally without the overhead of relational joins.
- Schema flexibility allows adding fields (e.g., `expiresAt`, `clicks`, custom metadata) without migrations.
- Mongoose provides schema-level validation, type casting, and indexing in one place, reducing boilerplate.
- Connection pooling (max 10) is configured to prevent resource exhaustion under concurrent load.

### Redis

**Decision:** Use Redis as the caching and rate limiting layer via the native `redis` v4 client (Promise API).

**Reasoning:**
- Redis is an in-memory store optimized for key-value lookups — ideal for hot URL cache reads where sub-millisecond response times matter.
- The native v4 client uses the Promise API natively, removing the need for `promisify` wrappers and keeping async code clean.
- Using Redis for both caching and rate limiting avoids introducing a second in-memory store.

### Nanoid

**Decision:** Use `nanoid` with a custom alphabet for short code generation instead of UUID or hash-based approaches.

**Reasoning:** Covered in detail in [Section 3](#3-url-encoding-strategy).

---

## 2. Architecture Pattern

**Decision:** Service-Oriented Architecture with thin controllers.

```
Request → Router → Validator → Controller → Service → Model/Cache
```

**Reasoning:**
- **Thin controllers** delegate all business logic to service classes. This keeps controllers focused on HTTP concerns (parsing request, sending response) and makes services independently testable without an HTTP layer.
- **Validators** are extracted into their own layer so validation logic is reusable and not buried inside controllers or services.
- **Middleware** handles cross-cutting concerns (rate limiting, error handling, logging) without polluting business logic.
- This separation of concerns makes the codebase easier to reason about for reviewers and easier to extend without cascading changes.

---

## 3. URL Encoding Strategy

**Decision:** Nanoid with a 62-character alphabet (`0-9A-Za-z`) and a code length of 9 characters.

```js
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 9);
```

**Reasoning:**

| Option | Rejected Because |
|--------|-----------------|
| MD5/SHA hash (truncated) | Hash collisions are more likely with truncation; non-trivial to guarantee uniqueness |
| Sequential integer ID | Predictable and enumerable — anyone can crawl all URLs by incrementing the ID |
| UUID | 36 characters is too long for a short URL; not URL-friendly |
| Base62 counter | Requires a global atomic counter, introducing a stateful bottleneck |

**Why Nanoid + Base62:**
- 9 characters from a 62-character alphabet gives `62^9 ≈ 13.5 trillion` possible codes — effectively collision-free at any realistic scale.
- Nanoid uses a cryptographically secure random source, making codes non-guessable.
- The alphabet is URL-safe (no `+`, `/`, or `=` which require percent-encoding).
- Code length is configurable via `config.codeLength` without changing the generation logic.

**Custom Codes (Vanity URLs):**
- Users can request a custom code (3–20 chars, alphanumeric + hyphens/underscores).
- When a custom code is provided, the reverse-lookup cache (long URL → short URL) is bypassed intentionally — the same long URL can have multiple custom short codes.

---

## 4. Database Design

**Decision:** Single `redislinks` collection with the following schema:

| Field | Type | Notes |
|-------|------|-------|
| `urlCode` | String | Unique index, lowercase-normalized |
| `longUrl` | String | Validated at write time |
| `shortUrl` | String | Unique index, computed on write |
| `clicks` | Number | Default 0, incremented asynchronously |
| `expiresAt` | Date | Nullable; enables TTL-based expiry |
| `createdAt` | Date | Auto-managed by Mongoose timestamps |
| `updatedAt` | Date | Auto-managed by Mongoose timestamps |

**Reasoning:**

- **Unique indexes on `urlCode` and `shortUrl`** ensure the database acts as the last line of defense against duplicate codes, even under concurrent inserts where application-level checks could race.
- **`shortUrl` stored as a computed field** (not derived at read time) means redirects only need a single indexed lookup on `urlCode` — no string construction in the hot path.
- **`clicks` tracked in the DB** rather than only in Redis means analytics survive cache eviction and Redis restarts.
- **`expiresAt` as nullable Date** allows optional TTL per URL without a separate collection or cron job — expiry is checked at redirect time.
- **`lowercase: true` on `urlCode`** normalizes codes at the DB level, preventing case-sensitivity bugs in lookups across different clients.

---

## 5. Caching Strategy

**Decision:** Two-layer cache: L1 (Redis) → L2 (MongoDB), with a 24-hour TTL on Redis entries.

**Cache-First Read Flow (redirect):**
```
Request /:urlCode
    ↓
L1: Redis lookup          ~1-5ms
    ↓ miss
L2: MongoDB lookup        ~20-50ms
    ↓ hit → backfill Redis
    ↓ miss → 404
```

**Two Cache Key Types in Redis:**
1. `urlCode → { longUrl, expiresAt }` — used on redirect
2. `longUrl → { urlCode, shortUrl, longUrl }` — used on shorten to detect duplicates without a DB query

**Reasoning:**
- Redirects are the dominant read operation. Serving them from Redis (in-memory) avoids a DB round-trip on every hit, which is critical for latency-sensitive redirects.
- Backfilling Redis on a MongoDB hit ensures frequently accessed URLs stay warm without a separate warming job.
- Reverse lookup (`longUrl → code`) avoids creating duplicate short codes for the same URL — checked in Redis before hitting MongoDB.
- **24-hour TTL** balances cache freshness with memory usage. Stale entries are automatically evicted; active URLs are re-cached on next access.
- **Graceful degradation:** if Redis is unavailable, the application falls back to MongoDB-only reads. Rate limiting is disabled in this state (logged as a warning), but core functionality remains intact.

**Click Counting — Fire-and-Forget:**
- Click increments are dispatched asynchronously after the redirect response is sent.
- The user is never blocked waiting for an analytics write.
- Errors in click tracking are logged but never propagated — a failed counter update is acceptable; a delayed redirect is not.

---

## 6. API Design

**Decision:** RESTful API under a versioned namespace (`/api/v1/`), with redirects at the root level.

**Endpoints:**

| Method | Path | Purpose | Success Code |
|--------|------|---------|-------------|
| `GET` | `/` | Welcome + endpoint listing | 200 |
| `GET` | `/health` | Liveness check | 200 |
| `POST` | `/api/v1/url/shorten` | Create a short URL | 201 / 200 |
| `POST` | `/api/v1/url/bulk` | Batch shorten (up to 10) | 207 |
| `GET` | `/api/v1/url/:urlCode/stats` | URL analytics | 200 |
| `GET` | `/:urlCode` | Redirect to original URL | 302 |

**Reasoning:**

- **Versioned namespace (`/api/v1`)** allows breaking changes to be introduced in `/api/v2` without disrupting existing integrations. The version is in the path (not a header) for visibility and ease of testing.
- **Redirect at root (`/:urlCode`)** keeps short URLs as short as possible — no `/r/` or `/go/` prefix that would add characters to the short URL.
- **201 for new URLs, 200 for existing** — the response code communicates whether a new resource was created or an existing one was returned. This matters for clients that need to distinguish deduplication from creation.
- **302 (temporary redirect) over 301 (permanent)** — a 301 is cached aggressively by browsers. If a URL is updated or expires, clients with a cached 301 would never check again. 302 ensures every redirect goes through the server.

---

## 7. Rate Limiting

**Decision:** Redis-backed per-IP rate limiting with different limits for read vs. write endpoints.

| Endpoint Group | Limit |
|---------------|-------|
| General (health, stats, redirect) | 100 requests / 15 min |
| Write (shorten, bulk) | 20 requests / 15 min |

**Reasoning:**
- **Per-IP limiting** in Redis is distributed — limits are shared across all server instances, unlike in-memory limiters that reset per process.
- **Stricter limits on write endpoints** reflects the asymmetry of the workload: reads are expected to be orders of magnitude more frequent, and writes are more expensive (validation, DB writes, cache updates).
- **`trust proxy: 1`** is set on the Express app so that `X-Forwarded-For` headers from a reverse proxy (e.g., nginx) are trusted for IP extraction, ensuring limits apply to the real client IP, not the proxy's IP.
- **Graceful fallback:** if Redis is down, rate limiting is bypassed rather than blocking all traffic. The trade-off (potential abuse during Redis outage) is acceptable given that the alternative (full service outage for rate limit failure) is worse.

---

## 8. Input Validation & Sanitization

**Decision:** Multi-stage validation pipeline: sanitize → validate format → validate reachability.

**Stage 1 — Sanitization:**
- Trim whitespace
- Escape HTML entities
- Block patterns: `javascript:`, `<script`, `on*=` attributes
- Prevents stored XSS if URLs are ever rendered in a UI

**Stage 2 — Format Validation:**
- `valid-url` library checks for well-formed URLs
- Custom regex validates scheme, domain, and path structure
- Ensures the input is structurally a URL before making any network calls

**Stage 3 — Reachability Check (via Axios HTTP GET):**
- Makes an actual HTTP request to the target URL
- Rejects URLs that return errors or are unreachable
- Prevents shortening of broken or malicious links

**Reasoning:**
- Layering validation from cheap (regex) to expensive (network I/O) avoids unnecessary network calls for obviously invalid inputs.
- Reachability validation is a deliberate UX choice: a URL shortener that produces dead links is worse than one that rejects unverifiable URLs.
- The trade-off is latency: each shorten request incurs a network round-trip. This is acceptable because shortening is a low-frequency, user-initiated action — not a hot path like redirects.

---

## 9. Error Handling

**Decision:** Custom error class hierarchy with a centralized error-handling middleware.

```
AppError (base)
├── ValidationError  → HTTP 400
├── NotFoundError    → HTTP 404
└── DatabaseError    → HTTP 500 (non-operational)
```

**Reasoning:**
- **Custom classes** allow `instanceof` checks and carry HTTP status codes as first-class properties, avoiding magic numbers scattered across the codebase.
- **`isOperational` flag** distinguishes expected errors (bad input, not found) from unexpected errors (DB crash). Non-operational errors trigger graceful shutdown rather than silent continuation.
- **Centralized middleware** ensures every error — whether thrown manually or from an unhandled Promise rejection — is formatted consistently. Clients always receive the same JSON shape.
- **Stack traces in development, hidden in production** — exposes debugging detail locally without leaking implementation internals to production clients.
- **`asyncHandler` wrapper** eliminates try-catch boilerplate in every controller/service function by forwarding rejections to the Express error middleware automatically.

---

## 10. Bulk Processing

**Decision:** Use `Promise.allSettled` for bulk URL shortening, returning HTTP 207 Multi-Status.

**Reasoning:**
- `Promise.allSettled` (vs. `Promise.all`) processes all URLs regardless of individual failures. A single invalid URL in a batch does not abort the entire request.
- **HTTP 207 Multi-Status** is the semantically correct code for a batch operation where some items may succeed and others fail — it signals to clients that they must inspect each item's status individually.
- **Batch limit of 10 URLs** prevents a single request from consuming excessive resources (validation + DB writes + cache updates per URL). This is hardcoded but can be made configurable via environment variable if deployment requirements change.

---

## 11. Graceful Shutdown

**Decision:** Handle `SIGTERM`, `SIGINT`, uncaught exceptions, and unhandled promise rejections with ordered resource cleanup.

**Shutdown sequence:**
1. Stop accepting new HTTP connections
2. Disconnect MongoDB
3. Disconnect Redis
4. Exit process

**Reasoning:**
- Closing the HTTP server first prevents new requests from arriving while cleanup is in progress.
- Disconnecting MongoDB before Redis ensures any pending DB operations that might need cache access complete first.
- Handling `uncaughtException` and `unhandledRejection` provides a last-resort cleanup path for unexpected failures, preventing orphaned connections that would exhaust DB/Redis connection pools.

---

## 12. Authentication

**Decision:** No authentication implemented.

**Reasoning:**
- The current scope targets a public URL shortening service where frictionless access is the priority.
- Adding authentication (JWT, API keys) would introduce session management, token storage, and per-user rate limiting — a significant scope increase with no current requirement driving it.

**Known risk:** Without authentication, there is no ownership model. Any client can create short URLs, and there is no way to restrict, audit, or revoke URLs per user.

**Future path:** API key-based authentication would be the natural first step — low overhead for clients, enables per-key rate limiting, and allows URL ownership without a full user account system.

---

## 13. Trade-offs & Known Limitations

| Area | Trade-off | Impact |
|------|-----------|--------|
| No authentication | Ease of use vs. abuse potential | Any client can shorten any URL |
| External URL validation via HTTP GET | Security vs. latency | Adds 100–500ms per shorten request |
| Redis optional | Resilience vs. rate limiting | Rate limiting disabled if Redis is down |
| Cache TTL not synchronized | Simplicity vs. consistency | `urlCode` and `longUrl` keys can expire at different times |
| Fire-and-forget click counting | Redirect latency vs. analytics accuracy | Click counts may be slightly undercounted under failure |
| No index on `clicks` | Simplicity vs. analytics query performance | Sorting by popularity is O(n) full collection scan |
| Bulk limit hardcoded (10) | Simplicity vs. configurability | Requires code change to adjust batch size |
| 302 redirect (not 301) | Correctness vs. browser cache efficiency | Every redirect hits the server; no client-side caching |
