# Architecture — Personal Gemini Journal + AI Knowledge & Resource Companion

**Status:** Approved for implementation (v1.0)
**Date:** 2026-09-01
**Branch:** `arena/01a05df0-google-academy-companion`
**Applies to:** Google Academy Ideathon submission

This is the **master architecture document**. It defines the complete technical architecture that the Developer, Tester, Architecture Reviewer, and Compatibility Reviewer agents follow. Specialized designs live in the companion documents listed in [§12](#12-document-map); each agent must read this document first, then the document relevant to their task.

---

## 1. Purpose

Build the mandatory **Personal Gemini Journal** (multi-turn AI conversation journal with authentication, summarization, private persistence, secure secrets, and Cloud Run deployment) and extend it with the original enhancement: **a personal knowledge/resource library** that transforms useful conversations and external learning resources into a structured, private knowledge base.

---

## 2. Repository assessment (done 2026-09-01)

### 2.1 What actually exists

| Item | Claimed in brief | Actual state | Verdict |
|---|---|---|---|
| GitHub repository | ✅ | `github.com/AtharvaPatil552-oss/google-academy-companion` | ✅ Correct |
| Clean Git history | ✅ | 1 initial commit | ✅ Correct |
| `.gitignore` | ✅ | Present (Node-oriented; covers `.env`, `node_modules`, `dist`, `.firebase`) | ⚠️ Needs additions for Python (see §2.3) |
| `README.md` | ✅ | Present, 2 lines | ⚠️ Needs updating to point at `docs/` |
| Firebase Authentication | ✅ | **Not configured** (no Firebase project config in repo) | ❌ Missing — must be created |
| Cloud Firestore | ✅ | **Not configured** | ❌ Missing — must be created |
| Gemini API key | ✅ | **Not present** | ❌ Missing — must be provisioned (never committed) |
| Local `.env` | ✅ | **Not present** | ❌ Missing — `.env.example` will be committed, real `.env` is local-only |
| `docs/architecture.md` | ✅ | **Not present** | ❌ Missing — this document |
| `docs/setup.md` | ✅ | **Not present** | ❌ Missing — recreated in this batch |
| Termux / Git / gh / Node / Python tooling | ✅ | Available in dev environment (sandbox: Linux, Python 3.11, Node 22, npm 10, gh 2.23; Termux is the target dev environment) | ✅ Assumed present on Termux |
| Feature branch | ✅ | `arena/01a05df0-google-academy-companion` | ✅ Correct — all work on this branch |

### 2.2 What is correct and must be preserved

- The Git repository, single-commit history discipline, and the feature-branch workflow.
- The `.gitignore` core rules (`node_modules`, `dist`, `.env`, `.firebase`, logs).

### 2.3 What must change

- **Add Python ignores** to `.gitignore`: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.coverage`, `htmlcov/`.
- **Create `docs/`** (this batch of documents).
- **Bootstrap cloud resources** (Firebase project, Firestore, Auth provider, Gemini key, Secret Manager secret, Cloud Run service) — see `docs/setup.md`.
- **Build the application** in the phases defined in `docs/development-workflow.md`.

---

## 3. Locked technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite (JavaScript/HTML/CSS) | Vite dev server proxies `/api` to FastAPI in dev |
| Backend | Python + FastAPI | REST API; all business logic; **not** Node/Express (no incompatibility found — see §10.2) |
| Auth | Firebase Authentication (email/password) | Client signs in; backend verifies ID tokens |
| Database | Cloud Firestore | All access **server-side only** (see §7) |
| AI | Gemini API via `google-genai` (official GA SDK) | `generateContent` API; Flash-tier model, pinned via env var |
| Secrets | Google Cloud Secret Manager | Production Gemini key; injected into Cloud Run as env var |
| Deployment | Google Cloud Run | Single service serving API + built frontend |
| Dev tooling | Termux, Git, GitHub CLI, Python 3.10+, npm/Node, Firebase CLI, gcloud CLI | See `docs/setup.md` |

**Rationale for each locked choice** is in `docs/compatibility-matrix.md` with official-documentation citations.

---

## 4. High-level architecture

**Modular monolith.** One FastAPI application, one Cloud Run service. No microservices: the workload is a single small team with one domain; there is no demonstrated need for service decomposition.

```
                        USER
                          │
                          ▼
                 React + Vite (browser)
                 ─────────────────────
                 • Firebase Auth sign-in   • UI
                 • ID token (Bearer)       • client state
                          │
                  HTTPS / REST JSON (Authorization: Bearer <ID token>)
                          ▼
                Python FastAPI  ── Cloud Run ──
                ──────────────────────────────
                • Auth middleware (verify ID token → uid)
                • Authorization (every query scoped to uid)
                • Conversation / Summary / Resource / Knowledge services
                • Gemini orchestration
                • Firestore repository layer (Admin SDK)
                • AI output validation (Pydantic)
                • Rate limiting, error handling
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 Firebase Auth     Cloud Firestore      Gemini API
 (token verify)     (user-scoped data)   (chat, summary,
        │                 │               analysis, knowledge)
        │                 │                  │
        └─────────────────┼──────────────────┘
                          ▼
                  Secret Manager
                 (GEMINI_API_KEY,
                  injected at runtime)
                          ▼
                   USER EXPERIENCE
```

**Production topology (single Cloud Run service):**

```
Browser ──HTTPS──▶ Cloud Run (FastAPI)
                     ├─ /api/v1/*          → REST API
                     ├─ /healthz           → health check
                     └─ /*                 → built React SPA (static files)
                     Env (from Secret Manager): GEMINI_API_KEY, GOOGLE_CLOUD_PROJECT, ...
                     ADC service account: Firestore IAM, Secret accessor
```

Why one service: one deploy target, no CORS in production, no cross-origin auth complexity, smallest operational surface for the deadline. The frontend is compiled to static files and mounted by FastAPI. In development the Vite dev server (port 5173) proxies `/api` to FastAPI (port 8000).

**Alternative (documented, not required):** Firebase Hosting serving the SPA with a `/api/**` rewrite to the Cloud Run service. Rejected for MVP because it adds a second deploy target and CORS configuration without security benefit.

---

## 5. System components and responsibilities

| Component | Location | Responsibilities |
|---|---|---|
| Frontend (React/Vite) | `frontend/` | UI; Firebase Auth client flow; calling the API; rendering conversations, resources, knowledge, summaries, recommendations; client-side validation; state |
| API layer | `backend/app/api/routes/` | HTTP routes; request/response Pydantic schemas; error mapping |
| Auth middleware | `backend/app/api/dependencies/auth.py` + `core/security.py` | Verify Firebase ID token → verified `uid`; reject invalid/expired; provide `AuthContext` |
| Authorization layer | `backend/app/repositories/firestore/` + service entry points | Every Firestore operation is addressed under `users/{verified_uid}/…`; ownership checks; never trusts client-supplied ids |
| Conversation service | `services/conversation_service.py` | Create/list conversations, append messages, assemble context, orchestrate Gemini turn |
| Gemini service | `services/gemini_service.py` | Single wrapper around `google-genai`; chat, structured generation, retries, safety-config defaults |
| Context service | `services/context_service.py` | Builds the per-turn prompt: recent messages + rolling summary + relevant knowledge + relevant resources (user-scoped) |
| Summary service | `services/summary_service.py` | Trigger logic, incremental summarization, schema validation, persistence |
| Resource service | `services/resource_service.py` | Ingestion (text/URL/PDF/note), content extraction, size caps, Gemini analysis, metadata persistence |
| Knowledge service | `services/knowledge_service.py` | Extraction suggestions, manual add/edit, approve/reject workflow |
| Recommendation service | `services/recommendation_service.py` | Optional next-step recommendations from user data (non-blocking) |
| Firestore repository layer | `repositories/firestore/` | The **only** code that touches Firestore; every method takes `uid` first; transaction/error handling |
| Validation layer | `schemas/` (API) + `models/` (AI outputs) | Pydantic validation for all request bodies and all Gemini structured output |
| Config/secrets layer | `core/config.py` | pydantic-settings; env vars; Secret Manager injection happens at the platform level on Cloud Run |
| Progress service (future) | `services/progress_service.py` | Optional learning-path/progress tracking; designed but not MVP |

**How components communicate:** strict one-way layering — routes → dependencies → services → repositories → Firestore; services → gemini_service → Gemini API. No component bypasses its layer. Repositories are the only Firestore access point; `gemini_service` is the only Gemini access point. This keeps security review tractable and enables the emulator-based tests.

---

## 6. Authentication pipeline

```
User ──▶ React (Firebase Auth, email/password)
          │
          ▼  onAuthStateChanged → session restored; getIdToken() → ID token (JWT, ~1 h TTL)
          ▼
   API request:  Authorization: Bearer <ID Token>
          ▼
   FastAPI auth dependency (core/security.verify_token)
          ▼
   firebase_admin.auth.verify_id_token(token)   ← signature + exp + aud checked, uid extracted
          ▼
   AuthContext(uid=…, email=…) injected into service functions
          ▼
   Authorization: all Firestore paths use users/{uid}/…  →  requested operation
```

Rules:
- **Never trust a UID supplied by the frontend.** UID always comes from the verified token. Request bodies that mention users are rejected.
- Invalid/expired/malformed tokens → `401` with `WWW-Authenticate: Bearer`; no data is touched.
- Logout: client calls Firebase `signOut()`, clears local state; server is stateless so there is nothing to revoke server-side. Tokens self-expire (~1 h).
- Session expiry: Firebase JS SDK refreshes tokens in the background. On a `401`, the client calls `getIdToken(/*forceRefresh=*/true)` and retries once; if that fails, the user is signed out to the login screen.
- Authenticated identity reaches services as an explicit first parameter `uid` on every service/repository call. Service signatures never accept a uid from the request payload.

Full detail: `docs/security-architecture.md` §2.

---

## 7. Critical decision: Firestore is server-only

**All Firestore reads and writes go through the FastAPI backend** using the Firebase Admin SDK. The web client never talks to Firestore directly.

- Firestore Security Rules are set to **deny all client access** (`allow read, write: if false;` for everything).
- Rationale:
  1. Zero cross-user leakage is a mandatory challenge requirement. A single server-side enforcement point (verified UID scoping in the repository layer) is the strongest, simplest guarantee.
  2. The Gemini/context flow requires the backend for every meaningful operation anyway; the client has no independent need to read Firestore.
  3. It eliminates an entire class of Security-Rules bugs (subcollection rule mistakes, unsafe queries, compound-rule gaps) — the #1 source of Firebase data leaks.
  4. It keeps the client thin and the API contract explicit.
- Trade-offs (accepted): no Firestore realtime listeners/offline sync on the client. This app is request/response chat, so this is fine.
- The Admin SDK bypasses Security Rules by design, so **server-side scoping is enforced in code** (repository layer), not by rules. IAM governs server access (see §21).
- App Check is not required for the MVP because clients never access Firestore; abuse control happens at the API layer (rate limiting, size caps).

> **Architecture Reviewer check:** confirm no client-side Firestore import exists in `frontend/` and that rules deny all clients.

---

## 8. Multi-turn conversation strategy

Real multi-turn conversations are mandatory. The backend persists every message and **never** sends unlimited history.

Context assembled per turn (order matters, cost-bounded):

1. **System prompt** — persona, guardrails, instructions that user content is data, not instructions (prompt-injection hardening).
2. **Rolling summary** of earlier conversation (if exists) — compressed memory, bounded size.
3. **Recent messages** — last `N=10` messages (5 turns) in full fidelity, hard char cap (~24 000 chars).
4. **Relevant knowledge** — top `k=3` approved knowledge items, matched by keyword overlap with the latest user message.
5. **Relevant resources** — top `k=2` resources, same keyword matching.

Trade-offs: full history is most coherent but grows token cost and latency and eventually exceeds the model context window; summaries lose detail; keyword retrieval is cheap and Firestore-native but less precise than embeddings. This strategy keeps per-turn prompt ≈ 4–10k tokens for a Flash-tier model: low cost, fast, deterministic, no vector infrastructure. Embeddings (Gemini embeddings + Firestore vector search) are a documented future upgrade in `docs/ai-architecture.md` §5 — explicitly **not** MVP.

Full detail: `docs/ai-architecture.md` §4 (including the fallback when no summary/knowledge exists yet).

---

## 9. Automatic summary strategy

**Trigger: threshold-based rolling summary + manual override (hybrid), executed as a background task.**

- Every time a conversation reaches a multiple of `6` new messages since the last summary, the Summary service generates an **incremental** rolling summary: `previous summary + new messages → new summary` (one Gemini call, bounded size, bounded cost).
- Generation runs via FastAPI `BackgroundTasks` so the user is not blocked; the chat response is returned immediately.
- A manual endpoint `POST /api/v1/conversations/{id}/summarize` allows on-demand summarization (e.g., before closing a session).
- If the background task fails, the app keeps working; the next trigger retries, and the manual endpoint is always available. A `lastSummaryAt` timestamp on the conversation drives the trigger.

Why this strategy: reliability (no user-blocking), cost (incremental ≈ one short call per 6 messages, not per message), latency (fire-and-forget), simplicity (no queue/worker service needed).

Structured summary fields (validated before persistence): `title`, `keyTopics[]`, `keyInsights[]`, `decisions[]`, `actionItems[]`, `openQuestions[]`, `progressState`, `messageRange {start,end}`, `model`, `createdAt`. Full schema: `docs/data-model.md` §4; validation: `docs/ai-architecture.md` §8.

---

## 10. Enhancement: resource & knowledge library

### 10.1 Resource ingestion (MVP scope)

Supported types, in priority order: **1) text, 2) URLs, 3) PDF documents, 4) notes.** No arbitrary website crawling, video ingestion, or audio in the MVP — only what the pipeline below actually implements.

```
Resource (text/url/pdf/note)
  → frontend → POST /api/v1/resources (authenticated)
  → input validation (type, size caps)
  → content extraction where supported (URL fetch via httpx; PDF via pypdf; text/note as-is)
  → Gemini analysis (structured metadata: summary, topics, concepts, difficulty,
                     prerequisites, related concepts, suggested next steps)
  → Pydantic validation
  → Firestore (users/{uid}/resources/{rid})
```

Failure handling: invalid URL → `422`; inaccessible URL → `422` (friendly message, resource marked `failed`); unsupported file type → `415`; empty content → `422`; oversized → `413`; Gemini failure → `502`, resource stored with `analysisStatus="failed"` and a retry button. Caps: text/notes ≤ 50 000 chars, PDF ≤ 5 MB, fetched URL body ≤ 2 MB (HTML stripped to ~50 000 chars of text).

### 10.2 Knowledge extraction (original feature)

**Hybrid, user-approved**: Gemini extracts candidate knowledge items automatically (during summarization and resource analysis), stored with `status="pending"`; the UI presents them as editable suggestions with **approve / edit / reject**. Users can also add knowledge manually (goes straight to `approved`). This is the practical MVP: automatic capture without letting unvalidated AI content pollute the library.

Knowledge item fields: `type` (concept/insight/question/action_item/resource), `topic`, `title`, `content`, `sourceRef {kind,id}`, `keywords[]`, `tags[]`, `projectRelevance`, `status`, timestamps. Full schema: `docs/data-model.md` §6.

### 10.3 AI context from private data

Gemini may use the user's own knowledge/resources/summaries as context. **Only the authenticated user's data is ever retrieved**: context queries are always `users/{verified_uid}/…`-scoped. There are no collection-group queries and no global searches in the MVP; retrieval happens inside the repository layer where the uid is mandatory. A malicious client cannot influence whose data is fetched.

### 10.4 Recommendations (optional, non-blocking)

`GET /api/v1/recommendations` composes recent summary + top knowledge + top resources → Gemini → `{recommendedNextStep, rationale, relatedResources[]}` (validated, cached in `users/{uid}/recommendations/{rid}`). It must never block or degrade MVP features. If Gemini fails, the endpoint returns a `503` and the UI shows a non-fatal empty state.

### 10.5 Progress/project layer (future)

Designed (`users/{uid}/progress/{pid}`) but **not implemented in the MVP**. Kept out to protect the deadline. If time remains after final QA, it is the first optional extension.

### 10.6 Voice (optional)

Not a core dependency. If implemented after the MVP: browser `MediaRecorder` → Gemini native audio input (Gemini models accept audio) → existing pipeline → text-to-speech via browser `speechSynthesis` or a Gemini TTS model. The app must remain fully functional without voice. Revisit only after compatibility review of the then-current Gemini audio/TTS support.

---

## 11. Secrets, Cloud Run, and security posture (summary)

- **Gemini key** is the only true secret. In production it lives in Secret Manager (`gemini-api-key`) and is injected into Cloud Run as the `GEMINI_API_KEY` environment variable at deploy time (`--set-secrets=GEMINI_API_KEY=gemini-api-key:latest`). The browser never receives it; it is never logged, hardcoded, or returned in API responses.
- **Local development** uses a gitignored `.env` file (template in `.env.example`); only FastAPI reads it.
- **Cloud Run service account** uses least privilege: `roles/datastore.user` (Firestore read/write), `roles/secretmanager.secretAccessor` (scoped to the one secret), `roles/firebaseauth.viewer` (reserved for future token-revocation checks), and the platform-default `logging.logWriter`. Service runs `--allow-unauthenticated` because authentication is via Firebase ID tokens, not IAP.
- **Error handling:** consistent API errors (`400/401/403/404/409/413/415/422/429/5xx`); never expose stack traces, keys, tokens, or internal details; safe structured logging.
- **Threat model:** full table (Threat → Risk → Mitigation → Test) in `docs/threat-model.md`.
- **Security testing:** emulator-based (Firestore + Auth emulators) unit/integration/security suites including explicit cross-user isolation tests; see `docs/development-workflow.md` §6 and `docs/security-architecture.md` §8.

---

## 12. Document map

| Document | Contents | Owner |
|---|---|---|
| **`docs/architecture.md`** (this file) | Master overview, decisions, MVP/enhancement split, risks, sequence | Architecture Reviewer |
| `docs/system-design.md` | Component design, directory structures, communication, config, dev/prod environments | Developer |
| `docs/data-model.md` | Firestore schema: collections, fields, types, indexes, ownership, authorities | Developer, Tester |
| `docs/api-design.md` | Full REST API: endpoints, Pydantic schemas, errors, Firestore/Gemini ops per endpoint | Developer, Tester |
| `docs/ai-architecture.md` | Gemini SDK, models, multi-turn context, summaries, analysis, knowledge, structured output, validation, cost | Developer |
| `docs/security-architecture.md` | Auth pipeline, authorization, security rules, Secret Manager, Cloud Run security, security test plan | Architecture Reviewer, Tester |
| `docs/threat-model.md` | Threat × risk × mitigation × test for every category | Architecture Reviewer |
| `docs/pipelines.md` | Mermaid diagrams for all 12 pipelines | Developer |
| `docs/compatibility-matrix.md` | Versioned compatibility matrix with official sources | Compatibility Reviewer |
| `docs/development-workflow.md` | Agent boundaries, phases, Termux workflow, definition of done, test commands | All agents |
| `docs/setup.md` | Environment + cloud bootstrap, step by step | Developer |

Avoid duplication: each design detail lives in exactly one document; others reference it.

---

## 13. MVP vs enhancement (hard split)

**MUST HAVE (MVP)**
1. Firebase Authentication (email/password), token verified server-side
2. FastAPI backend on Cloud Run
3. Gemini conversation (journal + brainstorm modes)
4. Real multi-turn interaction with bounded context
5. Conversation persistence (Firestore, server-only access)
6. Automatic rolling summaries + manual trigger
7. Private Firestore persistence with zero cross-user leakage
8. Secure key management via Secret Manager
9. Production deployment on Cloud Run
10. Health endpoint, structured errors, safe logging
11. Original enhancement: resource library (text/URL/PDF/note) + knowledge library with approve/edit/reject workflow

**OPTIONAL (post-MVP, in order)**
- Recommendations endpoint
- Progress/learning-path tracking
- Voice input/output
- Embedding-based retrieval upgrade
- Advanced resource ingestion (video, arbitrary pages)

If any optional item threatens the deadline, it is postponed — the MVP must remain shippable.

---

## 14. Risks and trade-offs

| # | Risk / trade-off | Severity | Mitigation |
|---|---|---|---|
| 1 | Server-only Firestore loses realtime/offline UX | Low | Not needed for request/response chat; documented in §7 |
| 2 | Keyword retrieval is less precise than embeddings | Medium | MVP scope; embeddings documented as upgrade (`ai-architecture.md` §5) |
| 3 | Background summary tasks can fail silently | Low | Retried on next trigger; manual endpoint; `lastSummaryAt` marker; error logged |
| 4 | In-process rate limiting is per-instance only | Low-Med | Cloud Run scale caps (max instances), per-uid token bucket, input caps; Redis upgrade documented |
| 5 | Gemini API changes (model deprecations, param deprecations) | Medium | Model pinned via `GEMINI_MODEL` env var; `google-genai` pinned; sampling-param deprecation noted (`ai-architecture.md` §2) |
| 6 | Termux resource constraints during development | Medium | Frontend/backend kept minimal; dev server on localhost; no heavy tooling |
| 7 | Cloud Run cold starts for background summary tasks | Low | min-instances 0 by default; 300 s request timeout; summaries tolerate latency |
| 8 | `check_revoked=False` on token verification (no per-request revocation check) | Low | Tokens expire in ~1 h; revocation on disable/delete rare; upgrade path documented (`security-architecture.md` §2.4) |
| 9 | PDF/URL extraction quality varies | Medium | Size caps, content-type allowlist, graceful `failed` state with retry |
| 10 | Cost abuse via Gemini | Medium | Per-user rate limits, input caps, max-instances cap, model pinned to Flash tier, monitoring alert on spend |

---

## 15. Final architecture questions — answers

1. **What happens when a user logs in?** Firebase Auth signs the user in the browser; `onAuthStateChanged` updates client state; the client obtains an ID token; every API call carries it as `Bearer`.
2. **How is the Firebase token verified?** `firebase_admin.auth.verify_id_token()` on the backend — signature, expiry, audience, issuer.
3. **Where is the authenticated UID obtained?** From the verified token claims (`claims["uid"]`), in `core/security.py`.
4. **How is cross-user access prevented?** (a) All Firestore paths are prefixed `users/{verified_uid}/…`; (b) clients have zero Firestore access (deny-all rules); (c) repositories take `uid` as a required first argument; (d) ownership checks return `404` for foreign resources.
5. **Which Firestore operations happen from the client?** None.
6. **Which from FastAPI?** All of them, via the repository layer (Admin SDK).
7. **Which security layer protects each operation?** Client→API: Firebase token verification; API→Firestore: code-enforced uid scoping + IAM (`datastore.user`); client→Firestore: Security Rules deny-all.
8. **Where is Gemini called?** Only in `gemini_service.py`, from the backend.
9. **Where is the Gemini secret stored?** Secret Manager in production; `.env` locally; never in the browser.
10. **How does multi-turn context work?** Rolling summary + last 10 messages + top relevant knowledge/resources (§8).
11. **How are summaries generated?** Incremental, every 6 messages, background task, plus manual endpoint (§9).
12. **How are summaries persisted?** `users/{uid}/conversations/{cid}/summaries/{sid}` after Pydantic validation.
13. **How are resources processed?** Validate → extract → analyze → validate metadata → persist (§10.1).
14. **How does knowledge extraction work?** Gemini suggestions with `pending` status; user approves/edits/rejects; manual add available (§10.2).
15. **How does Gemini receive relevant private context?** Repository queries scoped to the verified uid; assembled by `context_service` (§8, §10.3).
16. **How is AI output validated?** `response_schema` (JSON schema) at the API + Pydantic model validation; one retry, then fallback (`ai-architecture.md` §8).
17. **What happens when Gemini fails?** Retry (2 attempts) → friendly `502` for chat; `failed` analysis status with retry for resources; empty state for recommendations; summaries retried on next trigger.
18. **What happens when Firestore fails?** Repository maps errors to `503`; logged; client shows retryable error state; chat messages are not lost client-side (user can resend).
19. **What happens when authentication fails?** `401`; client refreshes token once, then signs out to login.
20. **How is abuse handled?** Per-uid rate limiting, input size caps, max-instances cap, Flash-tier model, spend monitoring; App Check documented as hardening.
21. **How is the app deployed to Cloud Run?** `gcloud run deploy` with source build; entrypoint `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; secret injection via `--set-secrets`; SPA served by FastAPI.
22. **What IAM permissions are required?** `datastore.user`, `secretmanager.secretAccessor` (secret-scoped), optional `firebaseauth.viewer`; Cloud Run defaults for logging/invocation.
23. **How are secrets supplied to Cloud Run?** `--set-secrets=GEMINI_API_KEY=gemini-api-key:latest` → env var at runtime.
24. **How will security rules be tested?** Firestore emulator + rules emulation; assert client reads/writes return `PERMISSION_DENIED`.
25. **How will cross-user isolation be tested?** Explicit security tests: unauthenticated → 401; A→own data → 200; A→B data → 404/403; plus rules tests.
26. **Which features are MVP?** §13 list.
27. **Which are optional?** §13 list (recommendations, progress, voice, embeddings, advanced ingestion).
28. **Is the architecture realistically achievable within the deadline?** Yes. The MVP is a standard CRUD API + one Gemini integration with a bounded context strategy, on one Cloud Run service, with emulator-based tests. The phased plan (`development-workflow.md` §7) puts the full mandatory stack first and defers all optional work.

---

## 16. Recommended implementation sequence

See `docs/development-workflow.md` §7 for the detailed phase plan. Summary:

1. **Setup** — repo hygiene, Firebase project, `.env`, emulators (setup.md)
2. **Backend skeleton** — FastAPI app, config, health, error handling, auth middleware (mock token verify)
3. **Auth** — real Firebase verify + security tests
4. **Firestore repositories** — schema, scoped CRUD, rules, emulator tests
5. **Gemini service** — chat, structured output, retries
6. **Conversation service** — multi-turn with context assembly
7. **Summary service** — rolling summaries
8. **Resources + knowledge services**
9. **Frontend** — login, chat UI, resource/knowledge UI
10. **Cloud Run deployment** — secrets, IAM, deploy, smoke test
11. **Testing + hardening** — full security suite, threat-model tests
12. **Optional features** — only after MVP is green
