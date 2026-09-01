# Development Workflow — Termux Agent Teams

Companion to `docs/architecture.md`. Defines agent boundaries, phase plan, Definition of Done, test commands, and the architectural change process. Read before starting any implementation.

---

## 1. Agent boundaries & responsibilities

| Agent | Scope | Must not |
|---|---|---|
| **Developer** | Implements tasks from the phase plan; follows this architecture exactly | Silently redesign; add unlisted tech; touch docs it doesn't own beyond fixes |
| **Tester** | Attempts to break the implementation; runs unit/integration/security suites per `threat-model.md`; reports failures with repro | "Fix" code without a bug report; skip security matrix |
| **Architecture Reviewer** | Verifies structural correctness against `architecture.md` + `security-architecture.md`; runs the §9 review checklist; approves phase gates | Rewrite architecture unilaterally |
| **Compatibility Reviewer** | Verifies every row of `compatibility-matrix.md`; tracks deprecations; signs off dependency changes | Introduce stack changes without the change process |
| **Editor** | UI/UX and frontend polish (later phase) | Change API contracts or data flow |

**Golden rule:** no agent redesigns the architecture. If a problem is found:

```
Problem → Evidence → Proposed change → Project lead approval → Implementation
```

Record proposals as GitHub issues labeled `architecture-change`; approval is a comment by the lead. After approval, the Architecture Reviewer updates the docs and the Developer implements.

---

## 2. Repo conventions

- Work happens on `arena/01a05df0-google-academy-companion` (this session's branch). Never commit to `main` directly.
- Commit style: conventional (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small atomic commits, clean history.
- Docs changes: each doc has an owner (§1); other agents may propose edits via issues/PRs.
- Secrets: never. `.env` is local; `.env.example` is the committed template.
- Lint/format: `ruff` (Python) + `eslint`/`prettier` (frontend) — minimal configs committed.

---

## 3. Directory layout (final)

```
google-academy-companion/
├── README.md
├── .gitignore
├── .env.example                  # backend env template (committed)
├── firebase.json                 # emulator config + rules + indexes references
├── firestore.rules               # deny-all ruleset
├── firestore.indexes.json        # empty in MVP (see data-model §9)
├── docs/                         # this batch (architecture docs)
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/                      # as per system-design.md §3
│   └── tests/                    # unit/ integration/ security/
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example              # VITE_FIREBASE_* template
│   └── src/                      # as per system-design.md §2
└── scripts/
    ├── deploy.sh                 # gcloud run deploy (source deploy + secrets)
    ├── seed_emulator.sh          # emulator start + test users
    └── scan_secrets.sh           # pre-commit secret scan
```

---

## 4. Phase plan (implementation order)

> Developer note: implement in this order; each phase ends with a gate (Definition of Done §7). Optional phases are marked ⭕ and are only worked on after all MUST phases are green.

**PHASE 1 — Setup (day 1)**
- [ ] Python ignores added to `.gitignore`; `.env.example` created (backend + frontend); `firebase.json` + `firestore.rules` (deny-all) + `firestore.indexes.json` committed.
- [ ] Firebase project created; Firestore enabled; email/password provider enabled; Gemini API key generated.
- [ ] Local `.env` filled; emulators installed and starting.
- [ ] Gate: `firebase emulators:start` boots; `pytest` runs an empty suite; `npm run dev` serves.

**PHASE 2 — Backend skeleton**
- [ ] FastAPI app: config (pydantic-settings), logging, error envelope, `/healthz`, `/api/v1/me` stub, request-id middleware, size-cap middleware.
- [ ] Auth dependency with firebase-admin `verify_id_token` (emulator tokens).
- [ ] Repos: conversations/messages/summaries/resources/knowledge (scoped CRUD) + Firestore emulator tests.
- [ ] Gemini service with mocked client; structured-output helper with validation/repair.
- [ ] Gate: full test suite green against emulators.

**PHASE 3 — Core chat**
- [ ] Conversation service + context assembly + multi-turn send message.
- [ ] Summary service (threshold + background + manual).
- [ ] Gate: curl-level E2E chat of 3+ turns against emulator + mock Gemini.

**PHASE 4 — Resources & knowledge**
- [ ] Resource service (text/url/pdf/note) with extraction + analysis + retry.
- [ ] Knowledge service + pending/approve/reject workflow.
- [ ] Gate: E2E resource → analysis → knowledge approval.

**PHASE 5 — Frontend**
- [ ] Auth screens (login/logout), dashboard, conversation UI (chat, modes), summaries panel.
- [ ] Resources UI (create, list, analysis status), knowledge UI (suggestions, approve/edit/reject, manual add).
- [ ] Vite dev proxy; API client with 401-refresh logic.
- [ ] Gate: full user journey in browser against emulator + mock Gemini.

**PHASE 6 — Production (Cloud Run)**
- [ ] Secret `gemini-api-key` in Secret Manager; SA created; IAM bindings.
- [ ] `scripts/deploy.sh` (source deploy, `--set-secrets`, healthz); smoke test against real Gemini.
- [ ] Gate: deployed URL passes smoke suite; no secrets in bundle/logs.

**PHASE 7 — Hardening & QA**
- [ ] Full security suite (threat-model §1–§7 tests), rate-limit tests, SSRF tests.
- [ ] Compatibility Reviewer re-verification; Architecture Reviewer checklist.
- [ ] Final E2E on deployed prod (register→login→chat→summary→resource→knowledge→reload→retrieve).

**PHASE 8 — Optional ⭕**
- [ ] Recommendations endpoint.
- [ ] Progress tracking.
- [ ] Voice.
- [ ] Embedding retrieval upgrade.

**PHASE 9 — Editor polish & submission** (UI/UX pass, README, demo script).

---

## 5. Termux-specific workflow

- Install: `pkg update && pkg install python nodejs git` (+ `gh`, `firebase-tools` via npm).
- Python: `python -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt`.
- Run backend: `cd backend && uvicorn app.main:app --reload --port 8000` (or via `scripts/dev_backend.sh`).
- Run frontend: `cd frontend && npm install && npm run dev` (proxy to `localhost:8000`).
- Emulators: `firebase emulators:start --only auth,firestore` (Termux: run in a second session; see setup.md for ports).
- gcloud on Termux is optional: deployment can be run from the sandbox/CI (`gh workflow_dispatch` or local `gcloud`); Firebase Auth config changes are UI/`firebase` CLI operations.
- Keep processes bound to `127.0.0.1`/`0.0.0.0` localhost only for dev; prod binding is Cloud Run.

---

## 6. Test commands (canonical)

```bash
# Backend unit + integration (emulator required)
cd backend && python -m pytest tests/unit tests/integration -q

# Security suite (explicit isolation matrix)
cd backend && python -m pytest tests/security -q

# Firestore rules tests (emulator rules emulation)
firebase emulators:exec --only firestore 'python -m pytest tests/security/test_rules.py -q'

# Frontend lint/build
cd frontend && npm run lint && npm run build

# E2E smoke (deployed prod)
bash scripts/smoke_e2e.sh <DEPLOYED_URL>

# Secret scan
bash scripts/scan_secrets.sh
```

Mocking strategy:
- Gemini: `GeminiService` behind an interface; tests inject a fake (deterministic responses, fault injection for 429/5xx/bad-JSON).
- Firestore: emulator (`FIRESTORE_EMULATOR_HOST=localhost:8080`), not mocks, so isolation tests are real.
- Auth: emulator minted ID tokens (Auth emulator issues verifiable tokens to the Admin SDK when `FIREBASE_AUTH_EMULATOR_HOST` is set).

---

## 7. Definition of Done (per phase and for MVP)

Per phase: all listed items implemented + tests green + Architecture Reviewer checklist passed (threat-model §9) + Compatibility Reviewer sign-off for any dependency change.

MVP done = all Phase 1–7 gates green **plus**:
- [ ] Isolation matrix (security-architecture §8.2) fully passing on emulator AND deployed.
- [ ] Deny-all rules verified.
- [ ] No secrets in repo/bundle/logs (scan clean).
- [ ] Real multi-turn Gemini chat works in production with Secret Manager key.
- [ ] Rolling summaries + manual summarize persist and reload.
- [ ] Resource (text/URL/PDF) + knowledge approve workflow works in production.
- [ ] `healthz` green; `/api/v1/me` returns stats; rate limiting active.

---

## 8. Change-request process (architecture deviations)

1. **Problem** — open an issue with the failing scenario/evidence (Tester or Reviewer).
2. **Evidence** — logs, test output, official-doc citation.
3. **Proposed change** — exact diff to the affected doc(s) + justification.
4. **Project lead approval** — comment on the issue.
5. **Implementation** — Developer implements; Reviewer updates docs; Tester adds regression tests.

Examples of changes requiring this process: replacing FastAPI, adding a database, enabling client-side Firestore, changing the summary trigger strategy, changing the context strategy, adding a new API endpoint that changes data flow.

---

## 9. Submission checklist (final)

- [ ] All docs consistent with the implemented system (Reviewer sweep).
- [ ] MVP green on deployed Cloud Run URL (smoke suite).
- [ ] Screenshot/demo script of: login → journal chat (multi-turn) → summary → resource add → knowledge approve → dashboard.
- [ ] README links docs/ and states the architecture summary + demo URL.
- [ ] `.env.example` present, `.env` absent from git; secret scan clean.
- [ ] Repository pushed to `arena/01a05df0-google-academy-companion`; PR from it if requested.
