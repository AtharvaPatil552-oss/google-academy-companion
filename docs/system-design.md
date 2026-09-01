# System Design — Personal Gemini Journal + Knowledge Companion

Companion to `docs/architecture.md` (master). This document details component structure, directory layouts, configuration, and the development/production environments. Read `architecture.md` first.

---

## 1. Component overview

```
┌────────────────────────────────────────────────────────────────┐
│ frontend/  (React + Vite, JavaScript)                          │
│  auth/          Firebase Auth client + session state            │
│  api/           fetch wrapper (Bearer token, error mapping)     │
│  pages/         Login, Dashboard, Conversation, Resources,      │
│                 Knowledge, Settings                             │
│  components/    Chat, MessageList, ResourceCard, KnowledgeCard, │
│                 SummaryPanel, RecommendationPanel, ...          │
│  hooks/         useAuth, useConversations, useResources, ...    │
│  state/         React context providers                         │
│  utils/         formatting, error helpers                       │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTPS, JSON, Authorization: Bearer <Firebase ID token>
┌───────────────▼────────────────────────────────────────────────┐
│ backend/  (Python 3.10+, FastAPI)                              │
│  app/main.py                 create_app, lifespan, routers,    │
│                              static SPA mount, error handlers  │
│  app/api/routes/             conversations.py, resources.py,   │
│                              knowledge.py, recommendations.py, │
│                              health.py                         │
│  app/api/dependencies/       auth.py (get_current_user),       │
│                              limits.py (rate limiting)         │
│  app/core/                   config.py, security.py, errors.py,│
│                              logging.py                        │
│  app/services/               gemini_service.py,                │
│                              conversation_service.py,          │
│                              context_service.py,               │
│                              summary_service.py,               │
│                              resource_service.py,              │
│                              knowledge_service.py,             │
│                              recommendation_service.py         │
│  app/repositories/firestore/ base.py, conversations.py,        │
│                              messages.py, summaries.py,        │
│                              resources.py, knowledge.py,       │
│                              recommendations.py               │
│  app/models/                 ai_outputs.py (summary, resource_ │
│                              metadata, knowledge, recommend.)  │
│  app/schemas/                api.py (request/response models)  │
│  app/utils/                  text.py, retrieval.py, ids.py     │
│  tests/                      unit/, integration/, security/    │
└───────────────┬────────────────────────────────────────────────┘
                │ Admin SDK (Firestore), google-genai (Gemini),
                │ ADC (IAM), Secret Manager (injected env)
┌───────────────▼────────────────────────────────────────────────┐
│ Cloud services: Firebase Auth · Cloud Firestore · Gemini API   │
│                 Cloud Run · Secret Manager                     │
└────────────────────────────────────────────────────────────────┘
```

**Layering rule (enforced in review):** routes → dependencies → services → repositories → Firestore. Services may call `gemini_service`. Nothing else imports Firestore or Gemini clients directly. This makes security review and testing tractable.

---

## 2. Frontend design (`frontend/`)

### 2.1 Tech

- React 19 + Vite 7 (JavaScript, no TypeScript — locked stack).
- Firebase JS SDK (modular, v12.x): `firebase/auth` only. **No `firebase/firestore` import anywhere in the client** (see architecture §7).
- React Router for pages; React Context + hooks for state (no Redux/Zustand in MVP).
- Plain CSS (no component library in MVP) to keep the build light for Termux.

### 2.2 API client contract

`src/api/client.js` exposes typed wrappers (thin): `api.getConversations()`, `api.createConversation(mode, title)`, `api.sendMessage(conversationId, content)`, `api.listMessages(conversationId)`, `api.listSummaries(conversationId)`, `api.summarize(conversationId)`, `api.createResource(...)`, `api.retryAnalysis(resourceId)`, `api.listKnowledge()`, `api.approveKnowledge(id)`, `api.rejectKnowledge(id)`, `api.updateKnowledge(id, patch)`, `api.createKnowledge(item)`, `api.getRecommendation()`.

Behavior:
- Reads the current ID token via `getAuth().currentUser.getIdToken()`; attaches `Authorization: Bearer <token>`.
- On `401`: force-refresh token once and retry; on second failure, dispatch `signOut` and redirect to `/login`.
- On `4xx/5xx`: normalizes the JSON error body `{detail: {code, message}}` into a typed error surfaced by UI toast/inline messages.
- Aborts stale requests (AbortController) when the user navigates.

### 2.3 Auth flow

`src/auth/firebase.js` initializes the app with `VITE_FIREBASE_*` env vars (public config only — safe to ship). `AuthProvider` wraps the app:
- `onAuthStateChanged` → `{user, idToken}` in context.
- Login page: email/password form → `signInWithEmailAndPassword`.
- Logout button → `signOut()` → router redirect.

### 2.4 Dev proxy

`vite.config.js`:

```js
server: { proxy: { '/api': 'http://localhost:8000', '/healthz': 'http://localhost:8000' } }
```

The built SPA never uses absolute backend URLs (preview-friendly, works on Cloud Run same-origin).

---

## 3. Backend design (`backend/`)

### 3.1 `app/main.py`

- `create_app()` builds the FastAPI instance; lifespan initializes Firebase Admin, Google GenAI client, and repository singletons.
- Mounts routers under `/api/v1`.
- Mounts `frontend/dist` as static assets with SPA fallback (serve `index.html` for non-`/api`, non-`/healthz` GET paths) **when `frontend/dist` exists**; in dev it simply 404s for unknown paths (Vite serves the SPA).
- Registers global exception handlers → consistent JSON errors (see `docs/api-design.md` §7).

### 3.2 `core/config.py` (pydantic-settings)

```python
class Settings(BaseSettings):
    project_id: str               # GOOGLE_CLOUD_PROJECT
    environment: str = "dev"      # dev | test | prod
    gemini_api_key: str | None    # GEMINI_API_KEY — env/Secret Manager; never in client
    gemini_model: str = "gemini-3.5-flash"
    frontend_dist: str = "../frontend/dist"
    max_message_chars: int = 4000
    context_recent_messages: int = 10
    context_max_chars: int = 24000
    summary_interval: int = 6
    resource_max_text_chars: int = 50000
    resource_max_pdf_bytes: int = 5 * 1024 * 1024
    resource_max_url_bytes: int = 2 * 1024 * 1024
    url_fetch_timeout_s: float = 15.0
    rate_limit_per_minute: int = 30
    cors_origins: list[str] = []   # dev-only; empty in prod (same-origin)
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
```

Only backend services read this object. No route/service reads `os.environ` directly.

### 3.3 `core/security.py`

- `init_firebase()` — `firebase_admin.initialize_app(credential=None)` → **Application Default Credentials** (works locally via `GOOGLE_APPLICATION_CREDENTIALS`, on Cloud Run via the runtime service account). Uses `firebase_admin.firestore.client()` for repositories.
- `verify_id_token(token: str) -> AuthContext` — wraps `auth.verify_id_token(token, check_revoked=False)` (see architecture §15 #8); raises `AppError(401, ...)` on any failure.
- `get_current_user` FastAPI dependency (in `api/dependencies/auth.py`) — reads `Authorization` header, calls `verify_id_token`, injects `AuthContext`.

### 3.4 `core/errors.py`

`AppError(status_code, code, message)` hierarchy; handlers map to the API error envelope. Never include tracebacks or internals in responses; log the traceback server-side at `error` level with a request id (see `core/logging.py`).

### 3.5 Services (single responsibilities)

- `gemini_service.py` — the **only** module importing `google.genai`. Functions: `chat_completion(messages) -> str`, `generate_structured(prompt, schema: type[BaseModel], fallback_text=None) -> BaseModel`, `is_available()`. Handles retry (2 attempts), timeout, safety-config defaults, response-mime-type JSON for structured calls. Model name from config.
- `conversation_service.py` — `create(uid, mode, title)`, `list(uid)`, `get(uid, cid)` (with messages), `delete(uid, cid)`, `send_message(uid, cid, content) -> (user_msg, assistant_msg)`:
  1. validate input; 2. append user message; 3. `context_service.assemble()`; 4. `gemini_service.chat_completion()`; 5. append assistant message; 6. update conversation counters; 7. schedule background summary if threshold hit; 8. return.
- `context_service.py` — pure function `assemble(uid, cid, latest_message) -> list[Content]`: summary + recent messages + relevant knowledge + relevant resources (via repositories). Pure-ish and unit-testable without Gemini.
- `summary_service.py` — `maybe_summarize(uid, cid)` (threshold check), `summarize_now(uid, cid)`, `list(uid, cid)`. Uses `gemini_service.generate_structured` with the `ConversationSummary` model.
- `resource_service.py` — `create(uid, payload)`, `list(uid)`, `get(uid, rid)`, `delete(uid, rid)`, `analyze(uid, rid)` (extraction + Gemini metadata), `retry_analysis(uid, rid)`.
- `knowledge_service.py` — `list(uid, status?)`, `get(uid, kid)`, `create(uid, item)` (manual), `update(uid, kid, patch)`, `delete(uid, kid)`, `apply_extracted(uid, items)` (stores with `pending`), `set_status(uid, kid, status)`.
- `recommendation_service.py` — `get_or_create(uid)` with caching; non-blocking.

### 3.6 Repositories (`repositories/firestore/`)

Every method signature starts with `uid`. They are the **only** Firestore access. Firestore client is the Admin SDK `firestore.client()`.

```python
class ConversationsRepo:
    async def create(self, uid: str, doc: dict) -> str: ...
    async def list(self, uid: str) -> list[dict]: ...          # users/{uid}/conversations order_by updatedAt desc
    async def get(self, uid: str, cid: str) -> dict | None: ...
    async def delete(self, uid: str, cid: str) -> bool: ...    # deletes subcollections first
```

- Message/subcollection writes use batched writes (Firestore batches allow up to 500 ops).
- List ordering that needs a composite index → documented in `docs/data-model.md` §9 (indexes).
- All queries are `users/{uid}/…`-prefixed. No collection-group queries in MVP.
- Errors: wrap `google.cloud.exceptions` → `AppError(503, "storage_unavailable", …)`.

### 3.7 ID generation

Firestore auto-IDs (`firestore.auto_id()` / document `add`) for `conversationId`, `messageId`, `resourceId`, `knowledgeId`. IDs are opaque strings; clients never construct or guess them (defense in depth against IDOR).

---

## 4. Configuration and secrets

### 4.1 Environment variables

| Var | Dev (Termux) | Test | Prod (Cloud Run) | Notes |
|---|---|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `.env` | emulator project | injected by platform | Firestore/Auth project |
| `GEMINI_API_KEY` | `.env` | mock key or `.env` | **Secret Manager** | never committed, never in client |
| `GEMINI_MODEL` | `.env` | test stub | env var | default `gemini-3.5-flash` |
| `ENVIRONMENT` | `dev` | `test` | `prod` | switches emulator endpoints + logging verbosity |
| `GOOGLE_APPLICATION_CREDENTIALS` | path to SA key (local) | emulator | ADC (none) | local-only; never committed |
| `FIRESTORE_EMULATOR_HOST` | optional | `localhost:8080` | unset | Admin SDK emulator switch |
| `FIREBASE_AUTH_EMULATOR_HOST` | optional | `localhost:9099` | unset | Admin SDK emulator switch |
| `PORT` | 8000 | 8000 | **set by Cloud Run** | uvicorn binds `0.0.0.0:$PORT` |
| `VITE_FIREBASE_*` | `.env` in `frontend/` | same | build-time env (public) | client config only |

`.env.example` (committed) contains every key with placeholder values and comments; real `.env` is gitignored.

### 4.2 Secret flow

```
Local dev:  .env  ──▶ pydantic-settings ──▶ gemini_service
Prod:       Secret Manager (gemini-api-key:latest)
              └── gcloud run deploy --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
                    └── env var GEMINI_API_KEY ──▶ gemini_service
```

Rotation: create a new secret version → `gcloud secrets versions add` → deploy (reference stays `:latest`) → after grace period delete old versions. No code change needed. See `docs/security-architecture.md` §5.

---

## 5. Development environment (Termux)

- Python 3.10+ (recommend 3.12 via `pkg install python`), venv at `backend/.venv`.
- Node 20+ / npm, Vite dev server at `127.0.0.1:5173`.
- Firebase CLI (`npm i -g firebase-tools`) for emulators; gcloud CLI for Cloud Run/Secret Manager ops.
- Emulators: `firebase emulators:start --only auth,firestore` (uses `firebase.json` + `firestore.rules`).
- Full setup commands: `docs/setup.md`.

---

## 6. Production environment (Cloud Run)

- Single service `journal-api`, region e.g. `asia-south1` (choose nearest for the team; any region works).
- Deploy: `gcloud run deploy journal-api --source . --region … --set-secrets=… --allow-unauthenticated --max-instances 10 --timeout 300 --memory 1Gi --cpu 1 --no-cpu-throttling` (CPU throttling off avoids latency spikes on Gemini calls; cost note: only needed if latency matters — default `--cpu-throttling` is acceptable too; Tester verifies latency).
- Build: Cloud Run source deployment with `requirements.txt` (Python 3.13 buildpack auto-detects FastAPI entrypoint per release notes; entrypoint override documented below for determinism).
- Entrypoint (explicit, deterministic):
  ```bash
  exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1 --timeout-keep-alive 65
  ```
  (Workers=1 keeps in-process rate limiting and Firestore client state simple; scale-out is via Cloud Run instances.)
- Health: `GET /healthz` → `{"status":"ok"}` (probes use it; no auth).
- Logging: structured JSON to stdout (`core/logging.py`), captured by Cloud Logging; sensitive values redacted.

---

## 7. Communication contracts

- All API traffic is JSON over HTTPS; envelope: success `{data: …}`, error `{error: {code, message, requestId}}` (see `docs/api-design.md` §7).
- Frontend→backend authentication: `Authorization: Bearer <Firebase ID token>`.
- Backend→Firestore: Admin SDK (IAM-scoped service account), user-scoped paths.
- Backend→Gemini: `google-genai` client, key from config; requests carry the assembled context; structured calls use `response_mime_type="application/json"` + `response_schema`.
- Backend→Secret Manager: none at runtime (injected as env var by Cloud Run). Direct API use is optional and explicitly not needed for MVP.

---

## 8. Non-functional properties

- **Latency:** chat turns target < 10 s p95 (Gemini flash); summaries run in background; URL/PDF analysis synchronous with 300 s request timeout.
- **Cost:** Flash-tier model; incremental summaries; bounded prompt size (§8 of architecture); max-instances cap.
- **Observability:** request-id middleware → correlate logs; error codes; `GET /healthz`.
- **Portability:** everything runs locally with emulators; prod differs only by env vars/IAM.
