# API Design — Personal Gemini Journal + Knowledge Companion

Companion to `docs/architecture.md` and `docs/data-model.md`. Every endpoint is defined here; implement exactly these. All endpoints are authenticated unless marked otherwise. Base path: `/api/v1`.

Conventions:
- Auth: `Authorization: Bearer <Firebase ID Token>` (required on everything except `/healthz`).
- Request/response bodies validated by Pydantic (`app/schemas/api.py`).
- Success: `200/201` with `{ "data": <object|array> }`.
- Errors: `{ "error": { "code": "<machine_code>", "message": "<human message>", "requestId": "<uuid>" } }` with proper HTTP status (see §7).
- IDs in paths are Firestore document IDs; ownership is always derived from the token, never from the body.

---

## 1. Endpoint inventory

| # | Method | Path | Purpose | MVP? |
|---|---|---|---|---|
| 1 | GET | `/healthz` | Liveness/readiness | ✅ |
| 2 | GET | `/api/v1/me` | Session info (uid, email, stats) | ✅ |
| 3 | POST | `/api/v1/conversations` | Create conversation | ✅ |
| 4 | GET | `/api/v1/conversations` | List conversations | ✅ |
| 5 | GET | `/api/v1/conversations/{id}` | Conversation detail + messages | ✅ |
| 6 | DELETE | `/api/v1/conversations/{id}` | Delete conversation | ✅ |
| 7 | POST | `/api/v1/conversations/{id}/messages` | Send message (Gemini turn) | ✅ |
| 8 | GET | `/api/v1/conversations/{id}/summaries` | List summaries | ✅ |
| 9 | POST | `/api/v1/conversations/{id}/summarize` | Force summary now | ✅ |
| 10 | POST | `/api/v1/resources` | Create resource (text/url/pdf/note) | ✅ |
| 11 | GET | `/api/v1/resources` | List resources | ✅ |
| 12 | GET | `/api/v1/resources/{id}` | Resource detail | ✅ |
| 13 | DELETE | `/api/v1/resources/{id}` | Delete resource | ✅ |
| 14 | POST | `/api/v1/resources/{id}/analyze` | (Re)run Gemini analysis | ✅ |
| 15 | GET | `/api/v1/knowledge` | List knowledge (status filter) | ✅ |
| 16 | POST | `/api/v1/knowledge` | Manually create knowledge | ✅ |
| 17 | PATCH | `/api/v1/knowledge/{id}` | Edit knowledge / change status | ✅ |
| 18 | DELETE | `/api/v1/knowledge/{id}` | Delete knowledge | ✅ |
| 19 | GET | `/api/v1/recommendations` | Get next-step recommendation | ⭕ optional |

Endpoints intentionally **not** in the MVP (from the brief's suggestion list): `/api/messages` (messages are subresources of conversations), `/api/progress` (progress layer is future), separate `/api/summaries` (summaries are conversation subresources). No endpoints exist merely because they were listed.

---

## 2. GET /healthz

Unauthenticated. Returns `200 {"status":"ok"}`. Used by Cloud Run probes and uptime checks. No DB or Gemini calls.

---

## 3. GET /api/v1/me

Returns session + aggregate stats for the dashboard.

- **Request:** —
- **Response `data`:** `{ uid, email, createdAt?, conversationCount, resourceCount, knowledgeCount, pendingKnowledgeCount }`
- **Errors:** 401.
- **Firestore ops:** profile get/create-if-missing; 3 count queries (or in-memory list lengths for MVP simplicity — Developer chooses; keep ≤ 50 docs).
- **Gemini ops:** none.

---

## 4. POST /api/v1/conversations

- **Request body:**
  ```json
  { "mode": "journal" | "brainstorm", "title": "<optional, ≤200 chars>" }
  ```
- **Validation:** mode enum; title length; body ≤ 2 KB.
- **Response `201 data`:** `{ conversationId, mode, title, createdAt, messageCount: 0 }`
- **Errors:** 401, 422, 503.
- **Firestore ops:** create `users/{uid}/conversations/{cid}`.
- **Gemini ops:** none.

---

## 5. GET /api/v1/conversations

- **Query params:** `limit` (default 20, max 50).
- **Response `data`:** array of `{ conversationId, mode, title, messageCount, summaryCount, updatedAt, createdAt }`.
- **Errors:** 401.
- **Firestore ops:** list ordered `updatedAt desc`.
- **Gemini ops:** none.

---

## 6. GET /api/v1/conversations/{id}

- **Response `data`:**
  ```json
  {
    "conversationId": "...", "mode": "journal", "title": "...",
    "messages": [ { "messageId": "...", "role": "user", "content": "...", "createdAt": "..." } ],
    "latestSummary": { "summaryId": "...", "title": "...", "createdAt": "..." } | null
  }
  ```
- **Authorization:** conversation must belong to verified uid; otherwise **404** (do not reveal existence).
- **Errors:** 401, 404, 503.
- **Firestore ops:** get conversation + latest summary + messages (bounded: last 50 by messageIndex; older pages omitted in MVP — see `docs/ai-architecture.md` §4).
- **Gemini ops:** none.

---

## 7. POST /api/v1/conversations/{id}/messages

The core Gemini turn.

- **Request body:**
  ```json
  { "content": "<string, 1..4000 chars>" }
  ```
- **Validation:** non-empty after trim; ≤ `MAX_MESSAGE_CHARS` (4000); body ≤ 8 KB. Client-side mirror validation in UI.
- **Response `201 data`:**
  ```json
  {
    "userMessage": { "messageId": "...", "role": "user", "content": "...", "createdAt": "..." },
    "assistantMessage": { "messageId": "...", "role": "assistant", "content": "...", "createdAt": "..." },
    "summaryTriggered": false,
    "conversation": { "conversationId": "...", "messageCount": 4, "updatedAt": "..." }
  }
  ```
- **Pipeline:** auth → conversation exists? → append user message → assemble context (recent messages + rolling summary + relevant knowledge/resources) → Gemini → append assistant message → update conversation → schedule background summary if threshold hit → respond.
- **Errors:** 401, 404, 413 (too long), 422, 429 (rate limit), 502 (Gemini failed after retries; user message already persisted so the client can show "resend"), 503 (Firestore).
- **Retry strategy:** Gemini calls retried twice (exponential backoff 1s/3s) on transient errors (`RESOURCE_EXHAUSTED` excepted — that surfaces as 429). Client-side: on 502 the user message is already persisted, and the UI shows "Assistant unavailable — tap to retry", which resends the same content as a new message. Documented trade-off (a resend creates a second user message); dedupe-by-client-id is a future refinement.
- **Firestore ops:** get conversation; create 2 message docs; update conversation counters; maybe write summary (background).
- **Gemini ops:** 1 chat completion (2 on retry).

---

## 8. DELETE /api/v1/conversations/{id}

- **Response `204`** on success.
- **Errors:** 401, 404, 503.
- **Firestore ops:** batched delete of conversation + messages + summaries.

---

## 9. GET /api/v1/conversations/{id}/summaries

- **Response `data`:** array of summary objects (schema per `docs/data-model.md` §5), newest first, `limit` param (default 10).
- **Errors:** 401, 404, 503.
- **Gemini ops:** none.

---

## 10. POST /api/v1/conversations/{id}/summarize

Manual summary trigger (also used to catch up after failures).

- **Request body:** `{}` (empty) or `{ "type": "manual" }`.
- **Response `201 data`:** the created summary (schema per data-model §5).
- **Behavior:** blocks until Gemini returns a validated summary; sets `lastSummaryAt`/`lastSummaryMessageIndex`; if Gemini fails → 502 with `analysisError`-style friendly message.
- **Errors:** 401, 404, 422, 502, 503.
- **Firestore ops:** read messages since `lastSummaryMessageIndex`; create summary doc; update conversation.
- **Gemini ops:** 1 structured call.

---

## 11. POST /api/v1/resources

- **Content-Type:** `multipart/form-data` OR `application/json` (Developer chooses; recommended: JSON for `text`/`note`/`url`, multipart for `pdf`). Define in implementation; Tester verifies.
- **Request (JSON variant):**
  ```json
  { "resourceType": "text" | "url" | "note",
    "title": "<optional>",
    "content": "<for text/note, ≤50000 chars>",
    "url": "<for url, http(s)>" }
  ```
- **Request (multipart):** `resourceType=pdf`, file field `file` (≤ 5 MB, `application/pdf`).
- **Processing:** validate → extract (URL fetch via httpx with 15 s timeout and content-type allowlist; PDF via pypdf) → cap sizes → store doc (`analysisStatus=pending`) → run analysis synchronously (status transitions `analyzing → completed|failed`).
- **Response `201 data`:** resource object incl. `analysis` if completed, else `analysisStatus` + `analysisError`.
- **Errors:** 401, 413 (oversized), 415 (unsupported type), 422 (invalid/empty/inaccessible URL), 502 (Gemini analysis failed — resource still saved with `failed`), 503.
- **Firestore ops:** create resource doc; update analysis fields.
- **Gemini ops:** 1 structured analysis call (with retries).

---

## 12. GET /api/v1/resources

- **Query params:** `limit` (default 20, max 50), `status` filter optional.
- **Response `data`:** array of resource summaries (without `rawText` unless `includeContent=true` — default false; keeps payloads small).
- **Errors:** 401.
- **Gemini ops:** none.

---

## 13. GET /api/v1/resources/{id}

- **Response `data`:** full resource incl. `rawText` and `analysis`.
- **Errors:** 401, 404, 503.

---

## 14. DELETE /api/v1/resources/{id}

- **Response `204`.**

---

## 15. POST /api/v1/resources/{id}/analyze

- Re-runs Gemini analysis for a `failed`/`pending` resource (retry button).
- **Response `200 data`:** updated resource.
- **Errors:** 401, 404, 409 (already `analyzing`), 502, 503.

---

## 16. GET /api/v1/knowledge

- **Query params:** `status` (`approved|pending|rejected`, default `approved`), `limit` (default 50).
- **Response `data`:** array of knowledge items (schema per data-model §7).
- **Errors:** 401.
- **Gemini ops:** none.

---

## 17. POST /api/v1/knowledge

Manual knowledge creation.

- **Request body:** knowledge fields minus `sourceRef`/`status`/timestamps (`type`, `topic`, `title`, `content`, `keywords?`, `tags?`, `projectRelevance?`).
- **Validation:** per-schema constraints.
- **Response `201 data`:** created item with `status=approved`, `sourceRef={kind:"manual"}`.
- **Errors:** 401, 422, 503.

---

## 18. PATCH /api/v1/knowledge/{id}

- **Request body:** any editable field(s) + optional `status` (`approved|rejected`). Used by the approve/edit/reject workflow for AI-suggested items.
- **Response `200 data`:** updated item.
- **Errors:** 401, 404, 422, 503.

---

## 19. DELETE /api/v1/knowledge/{id}

- **Response `204`.**

---

## 20. GET /api/v1/recommendations (optional)

- **Response `200 data`:**
  ```json
  { "recommendationId": "...", "recommendedNextStep": "...", "rationale": "...",
    "relatedResources": [ {"resourceId": "...", "title": "..."} ],
    "createdAt": "..." }
  ```
- **Behavior:** cache per 24 h; regenerate on demand. Failure → `503` with friendly message (non-blocking feature).
- **Errors:** 401, 503.

---

## 21. Pydantic schema notes (`app/schemas/api.py`)

- Use Pydantic v2 (`BaseModel`, `field_validator`, `ConfigDict(str_strip_whitespace=True)`).
- Reuse one `ConversationSummary` etc. between API response models and AI-output models where shapes match, but keep a separate `models/ai_outputs.py` for raw Gemini output so repair/validation logic stays isolated.
- Request bodies: strict length/enum constraints; reject unknown extra fields (`extra="forbid"` on request models) — hardens against garbage and injection attempts.
- Responses: `extra="ignore"` to tolerate forward-compatible server fields.

---

## 22. Error taxonomy

| HTTP | code | Meaning | Example |
|---|---|---|---|
| 400 | `bad_request` | Malformed request | invalid JSON |
| 401 | `unauthenticated` | Missing/invalid/expired token | expired ID token |
| 403 | `forbidden` | Valid token, not allowed | (reserved; ownership violations return 404) |
| 404 | `not_found` | Resource absent **or not owned** | foreign conversation id |
| 409 | `conflict` | State conflict | analyze while `analyzing` |
| 413 | `payload_too_large` | Body/size cap exceeded | 6 MB PDF |
| 415 | `unsupported_media_type` | Bad file type | text file posted as pdf |
| 422 | `unprocessable_entity` | Validation failure | bad mode enum, inaccessible URL |
| 429 | `too_many_requests` | Rate/usage limit | per-user burst |
| 500 | `internal_error` | Unexpected bug | unhandled exception |
| 502 | `upstream_error` | Gemini failure | model unavailable |
| 503 | `unavailable` | Firestore/Cloud dependency down | datastore timeout |

Rules: no stack traces, keys, tokens, or internal hostnames in responses; include `requestId` for log correlation; rate-limit errors include `Retry-After` header.

---

## 23. Rate limiting (per authenticated user)

- Sliding window token bucket: 30 requests/min default (configurable), keyed by uid; chat endpoint gets the same bucket in MVP.
- Unauthenticated `/healthz` is exempt; all other paths apply limits after auth.
- In-process (per instance) + `--max-instances` cap; documented upgrade: Redis-backed global limit (`docs/security-architecture.md` §7).
- Exceeded → 429 + `Retry-After`.

---

## 24. Request-size caps (enforced at API layer before any processing)

| Input | Cap |
|---|---|
| JSON body (chat) | 8 KB |
| JSON body (conversation create) | 2 KB |
| Text/note content | 50 000 chars |
| URL body | 2 MB fetched, stripped to 50 000 chars |
| PDF upload | 5 MB |
| Knowledge content | 4000 chars |
| Any request body | 6 MB (uvicorn/ASGI limit + middleware) |
