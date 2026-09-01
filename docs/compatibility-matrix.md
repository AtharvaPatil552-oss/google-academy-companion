# Compatibility Matrix — Personal Gemini Journal + Knowledge Companion

Companion to `docs/architecture.md`. Owned by the **Compatibility Reviewer**. Verify every row against official documentation at implementation time; versions below were checked 2026-09-01 against official sources.

Legend: ✅ compatible / ⚠️ verify at implementation / ❌ incompatible — do not use.

---

## 1. The matrix

| # | Technology | Purpose | Version requirement | Auth method | Data format | Depends on | Potential conflict | Deployment consideration |
|---|---|---|---|---|---|---|---|---|
| 1 | React | Frontend UI | v19 (any 18+ works with Vite 7) | n/a | JSX/JS | node/npm | none | Built to static files; served by FastAPI |
| 2 | Vite | Frontend build + dev server | v7 (latest); requires Node 20.19+/22.12+ | n/a | ES modules | node/npm | none | Dev proxy `/api` → `localhost:8000`; build output `dist/` |
| 3 | Firebase JS SDK (`firebase`) | Client auth + session | **v12.x** (12.17+ current; modular API) | Firebase Auth email/password | JS | node/npm | **Do not import `firebase/firestore`** (server-only design) | Config via `VITE_FIREBASE_*` (public values only) |
| 4 | Python runtime | Backend language | **3.10+**; target **3.13** on Cloud Run (GA); Admin SDK recommends 3.10+ | n/a | n/a | OS/Termux | google-genai requires 3.9+ (fine) | Cloud Run buildpack Python 3.13 GA |
| 5 | FastAPI | REST API framework | **0.136.x** (requires Python 3.10+); use `fastapi[standard]` | n/a (auth via dependency) | JSON | Pydantic v2 | none | Source deploy auto-detects FastAPI entrypoint (Cloud Run, Aug 2025 GA) |
| 6 | Pydantic | Validation (API + AI output) | **v2.x** (FastAPI-native) | n/a | Python models | FastAPI | v1 APIs incompatible — use v2 syntax only | v2 is what FastAPI 0.136 uses |
| 7 | Uvicorn | ASGI server | latest (0.30+) | n/a | ASGI | Python | none | Entrypoint `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; workers=1 |
| 8 | `google-genai` | Gemini API SDK (official GA) | **latest stable (≥1.55; 2.x line current)** | API key (`GEMINI_API_KEY`) | JSON / protobuf over HTTP | Python | Legacy `google-generativeai` is deprecated (do not use); `google-cloud-aiplatform` GenerativeModel deprecated May 2026 | Key from Secret Manager; model id env-pinned |
| 9 | Gemini API | Chat, summaries, analysis | `generateContent` (stable); Interactions API GA mid-2026 but still breaking — **defer** | API key | JSON | google-genai | Model ids change/deprecate; sampling params deprecated | `GEMINI_MODEL` env var; default Flash-tier `gemini-3.5-flash` (verify availability) |
| 10 | Firestore Python (`google-cloud-firestore`) | Database access (server) | v2.x latest (via firebase-admin) | ADC (service account) | Documents | firebase-admin | none | IAM `roles/datastore.user` |
| 11 | Firebase Admin SDK (`firebase-admin`) | Token verify + Firestore Admin | **v7.x** (7.5+ current Jul 2026); Python 3.9+ (3.10+ recommended) | ADC; emulators via env vars | JWT + Firestore | google-cloud-firestore, PyJWT | none | `verify_id_token` for auth; Admin bypasses rules → code-enforced scoping |
| 12 | Cloud Run | Production hosting | Python 3.13 runtime GA; source deploys support pyproject.toml/requirements.txt | IAM / ADC | container | gcloud CLI | none | Listen on `$PORT`; `--set-secrets`; healthz; max-instances |
| 13 | Secret Manager | Gemini key storage | API v1 (no client SDK needed — env injection) | IAM (`secretAccessor`) | secret payload | gcloud CLI | none | Deploy-time env injection; rotation via versions |
| 14 | Node/npm | Frontend toolchain + Firebase CLI | Node 20+ (22 current); npm 10 | n/a | n/a | OS | none | Termux: `pkg install nodejs` |
| 15 | Firebase CLI | Emulators, rules deploy | latest (13/14.x) | OAuth login | JSON config | Node | none | Emulators: `auth`, `firestore` |
| 16 | gcloud CLI | Cloud Run + Secret Manager + IAM | latest (480+) | OAuth / service account | CLI | Python | none | Termux: install via package or run from sandbox/CI |
| 17 | `httpx` | URL resource fetching (server) | latest (0.28+) | n/a | HTTP | Python | none | SSRF guards + 15 s timeout |
| 18 | `pypdf` | PDF text extraction | latest (4.x/5.x) | n/a | PDF | Python | none | 5 MB cap; graceful failure |
| 19 | `python-multipart` | Multipart uploads (PDF) | latest | n/a | multipart | FastAPI | none | Required by FastAPI for file uploads |
| 20 | `pytest` + `pytest-asyncio` | Tests | 8.x | n/a | Python | Python | none | Run against emulators |
| 21 | `httpx` TestClient / `fastapi.testclient` | API tests | same as FastAPI | n/a | ASGI | FastAPI | none | Use `ASGITransport` for async |

---

## 2. Integration notes (per pair that matters)

- **Firebase JS SDK (12.x) ↔ Vite:** modular ESM imports work with Vite 7; no polyfills needed. ✅
- **firebase-admin (7.x) ↔ Python 3.13:** supported (Python 3.9+ deprecated, 3.10+ recommended); verify on Cloud Run buildpack during Phase 2. ⚠️
- **google-genai ↔ FastAPI:** both async-friendly; `google-genai` provides async clients (`AsyncGeminiClient`) matching FastAPI async routes. Use async everywhere for consistent performance. ✅
- **google-genai ↔ Firestore Admin:** independent; both use gRPC/HTTP — no conflicts. ✅
- **Vite proxy ↔ FastAPI CORS:** in dev, the Vite proxy makes calls same-origin from the browser's perspective; keep CORS allowlist empty even in dev (preferred) or restricted to `http://localhost:5173`/`127.0.0.1:5173`. ✅
- **Cloud Run ↔ Secret Manager:** `--set-secrets=GEMINI_API_KEY=gemini-api-key:latest` maps secret to env var; runtime reads env only. ✅
- **Cloud Run ↔ Firestore/Gemini:** both reached via public APIs with ADC — no VPC connector needed. ✅
- **Termux ↔ gcloud CLI:** gcloud on Termux is installable but heavy; alternative: run gcloud from the sandbox/CI for deploy, and only use Firebase emulators + local servers on Termux. ⚠️ operational note for development-workflow.
- **React 19 ↔ Firebase JS SDK 12:** no known peer conflicts. ✅

---

## 3. Deprecated / rejected (do not use)

| Item | Why rejected |
|---|---|
| `google-generativeai` (legacy Gemini SDK) | Deprecated, not actively maintained; official docs recommend `google-genai` |
| `google-cloud-aiplatform` `GenerativeModel` module | Deprecated May 2026 in favor of `google-genai` |
| `@google/generativeai` (JS legacy) | Same deprecation status |
| Firebase v9 legacy namespaced SDK | v12 modular is current |
| `google-auth` manual JWT verification | Use firebase-admin `verify_id_token` |
| Pydantic v1 | FastAPI 0.136 + ecosystem is v2 |
| MongoDB/SQL/Redis (any DB besides Firestore) | No demonstrated need; keep stack locked |
| Dockerfile-based Cloud Run deploy | Source deploy supported since Aug 2025 — simpler |
| Interactions API (Gemini) for MVP | GA but actively changing; `generateContent` stable — defer migration |

---

## 4. Version pinning strategy

- `backend/requirements.txt`: pin exact or tight-range (`fastapi==0.136.*`, `google-genai==<current>`, `firebase-admin==7.*`, `pydantic>=2.7,<3`, `uvicorn[standard]`, `httpx`, `pypdf`, `python-multipart`, `pytest`, `pytest-asyncio`).
- `frontend/package.json`: `firebase` ^12, `react` ^19, `vite` ^7, `react-router-dom` ^7.
- `requirements.lock`/`package-lock.json` committed for reproducibility.
- **Renovate/`gh` dependabot or manual PRs only** — never bump-and-forget before a compatibility check; the Compatibility Reviewer signs off on every dependency change.

---

## 5. Compatibility review procedure

1. At the start of each implementation phase and before submission, re-verify the rows marked ⚠️ against official docs (URLs below).
2. Check deprecation announcements for `google-genai`, model ids, and Firebase SDK majors.
3. Update this matrix with the date + version found; flag conflicts to the Architecture Reviewer before any stack change.
4. A stack change (e.g., replacing FastAPI) requires the change-request process in `docs/development-workflow.md` §5.

---

## 6. Official documentation index (primary sources)

| Topic | Source |
|---|---|
| Gemini API libraries & SDK | https://ai.google.dev/gemini-api/docs/libraries |
| Gemini API changelog (models, deprecations) | https://ai.google.dev/gemini-api/docs/changelog |
| Gemini generateContent / interactions | https://ai.google.dev/gemini-api/docs/interactions |
| Firebase Admin Python SDK setup | https://firebase.google.com/docs/admin/setup |
| Firebase Admin Python release notes | https://firebase.google.com/support/release-notes/admin/python |
| Firebase JS SDK release notes | https://firebase.google.com/support/releases |
| Firebase Security Rules | https://firebase.google.com/docs/firestore/security/get-started |
| Firestore emulator | https://firebase.google.com/docs/emulator-suite |
| Cloud Run release notes (Python 3.13, source deploys) | https://docs.cloud.google.com/run/docs/release-notes |
| Cloud Run deploy (source) | https://docs.cloud.google.com/run/docs/deploying-source-code |
| Secret Manager (create/access/IAM) | https://cloud.google.com/secret-manager/docs |
| Cloud Run secrets | https://docs.cloud.google.com/run/docs/configuring/secrets |
| IAM roles reference | https://cloud.google.com/iam/docs/understanding-roles |
| FastAPI docs | https://fastapi.tiangolo.com |
| Vite docs | https://vite.dev |
| React docs | https://react.dev |
