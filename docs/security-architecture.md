# Security Architecture — Personal Gemini Journal + Knowledge Companion

Companion to `docs/architecture.md` and `docs/threat-model.md`. This document is the security specification: authentication, authorization, Firestore rules, Gemini key handling, Secret Manager, Cloud Run hardening, and the security test plan. Read `threat-model.md` for the full threat list; this document contains the mitigations in detail.

---

## 1. Trust boundaries

```
[Browser: React + Firebase Auth]   — UNTRUSTED
        │ HTTPS
        ▼
[FastAPI on Cloud Run]             — TRUSTED (verifies every request)
        │ Admin SDK (IAM)
        ▼
[Firestore / Gemini / Secret Manager]  — TRUSTED data plane
```

- The browser is untrusted: no secrets, no direct database access, no trust in any client-supplied identity or ownership data.
- Every request crossing boundary 1 is authenticated (Firebase ID token) and every data-plane access from boundary 2 is scoped to the verified uid.

---

## 2. Authentication

### 2.1 Client side (React)

- Firebase Auth email/password only (MVP).
- `firebase/auth` modular SDK; `onAuthStateChanged` drives session state; `getIdToken()` returns the JWT for API calls.
- The Firebase client config (`apiKey`, `projectId`, …) is public by design (it is not a secret) — do not put `GEMINI_API_KEY` or service-account files anywhere near the client bundle.

### 2.2 Server side (FastAPI)

`core/security.py`:

```python
def verify_id_token(token: str) -> AuthContext:
    try:
        decoded = auth.verify_id_token(token, check_revoked=False)
    except (ValueError, auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
            auth.RevokedIdTokenError, auth.CertificateFetchError) as exc:
        raise AppError(401, "unauthenticated", "Invalid or expired token") from exc
    return AuthContext(uid=decoded["uid"], email=decoded.get("email"))
```

- `firebase_admin.auth.verify_id_token` performs signature verification against Google's public certs, checks `exp` (token TTL ~1 h) and `aud` (the Firebase project id).
- **Never** parse JWTs manually with a third-party JWT library — the Admin SDK does verification correctly.
- FastAPI dependency `get_current_user` (in `api/dependencies/auth.py`) extracts the `Authorization: Bearer <token>` header and returns `AuthContext`. Routers use it via `Depends(get_current_user)`.
- Session/logout: client-side `signOut()`; server is stateless. Tokens expire by themselves; revoked tokens are caught on the next verification only if `check_revoked=True` (see §2.4).

### 2.3 Identity propagation

- `AuthContext.uid` is the **only** user identifier used for any Firestore path or query.
- Service and repository method signatures are `(uid, ...)` — the uid is a positional first parameter, never read from the request body.
- Any request body field that claims an owner (e.g. `"uid": "another-user"`) is rejected by schema validation (`extra="forbid"`).

### 2.4 Token revocation (trade-off, documented)

- `check_revoked=False` in MVP: avoids a Firestore lookup per request (latency/cost). Risk: an admin-disabled user keeps valid tokens until expiry (~1 h).
- Upgrade path (documented, not MVP): set `check_revoked=True` after enabling `firebaseauth.viewer` on the service account; or check revocation only on sensitive endpoints. Architecture Reviewer re-evaluates if judges require instant revocation.

---

## 3. Authorization & data isolation

**Principle: ownership is enforced by construction, not by filter.**

1. **Path scoping:** every document lives at `users/{uid}/...`; repositories prefix every query with the verified uid. There is no code path that reads `users/<something-else>/…` except the ownership check itself.
2. **Ownership check → 404:** `get(uid, foreign_id)` returns `None` → route maps to `404 not_found`. Foreign ids are indistinguishable from nonexistent ids (no existence oracle).
3. **No client Firestore access:** Security Rules deny all client access (§4); the only Firestore paths that exist in the client codebase are none.
4. **Server-side enforcement is code-enforced** — the Admin SDK bypasses Security Rules, so the repository layer is the security boundary for Firestore (reviewed in code review; covered by security tests).
5. **IAM** restricts *which service identities* may touch Firestore at all (`roles/datastore.user`, service-account-scoped).

Cross-user attack scenarios and their required test cases are enumerated in `docs/threat-model.md` §2 and tested per §8 of this document.

---

## 4. Firestore Security Rules (client-denied)

`firestore.rules` (the **entire** ruleset):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;   // deny-all for web/mobile clients
    }
  }
}
```

- No legitimate client access exists, so the ruleset is trivially auditable: **anything other than deny-all is a bug**.
- The emulator-based rules tests (§8) assert deny-all for anonymous and signed-in (A and B) clients, for all collections and all operations.
- If a future feature ever needs client reads (it should not), the ruleset must be redesigned with per-collection `match users/{uid}/... { allow read: if request.auth.uid == uid; }` and re-tested — Architecture Reviewer gate required.

---

## 5. Secret management

### 5.1 Inventory

| Secret | Where stored (prod) | Where used |
|---|---|---|
| `GEMINI_API_KEY` | Secret Manager, secret name `gemini-api-key` | Backend Gemini calls |
| Firebase service account key | **Never** needed in prod (ADC) | Local dev only, gitignored |
| Firebase client config | Public (committed in `.env.example` shape; real values in env) | Browser init |
| Firestore/Gemini project ids | Public-ish, in env | Config |

### 5.2 Secret Manager design

- Create once:
  ```bash
  gcloud secrets create gemini-api-key --replication-policy=automatic
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
  ```
- Access mechanism: Cloud Run injects the secret as an environment variable at deploy time — no runtime Secret Manager API calls, no code changes on rotation.
  ```bash
  gcloud run deploy journal-api --set-secrets=GEMINI_API_KEY=gemini-api-key:latest ...
  ```
- IAM: the Cloud Run service account needs `roles/secretmanager.secretAccessor` **on that secret only** (resource-scoped binding):
  ```bash
  gcloud secrets add-iam-policy-binding gemini-api-key \
    --member="serviceAccount:journal-api-sa@PROJECT.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
  ```
- Rotation: add a new version → redeploy (env picks up `:latest`) → delete old versions after grace. Zero-downtime, no code change.
- Local-development alternative: `.env` (gitignored), read by pydantic-settings. `.env.example` documents the shape.

### 5.3 Hard rules

- No `GEMINI_API_KEY` in committed files, logs, error messages, responses, or client bundle.
- No service-account JSON in the repo (it is gitignored via `*.json`-adjacent patterns? No — add explicit ignore: `*-service-account*.json` or place outside repo; see setup.md).
- Logging redaction helper ensures env values never enter log records (`core/logging.py`).
- Pre-commit/CI secret scan (e.g. `gitleaks` or `trufflehog`) — optional but recommended before submission.

---

## 6. Cloud Run hardening

| Concern | Configuration |
|---|---|
| Public endpoint | Required (browser calls it) — protection is at the app layer: Firebase token verification + rate limits |
| Authentication | No IAP/Identity-Aware-Proxy (would break browser flow) |
| Service account | Dedicated `journal-api-sa` (least privilege, see §5.2 + below) |
| IAM roles | `roles/datastore.user` (Firestore), `roles/secretmanager.secretAccessor` (secret-scoped), `roles/firebaseauth.viewer` (future revocation; optional now), `roles/logging.logWriter` (default) |
| Instance cap | `--max-instances 10` (cost + abuse bound) |
| Memory/CPU | `1 GiB / 1 CPU` (Gemini JSON parsing + PDF extraction headroom) |
| Timeout | `--timeout 300` (URL/PDF analysis + chat worst case) |
| Concurrency | default (80); chat is I/O-bound |
| Health | `GET /healthz` for probes |
| Secret exposure | only via env injection; never in image layers |
| CORS | empty allowlist in prod (same-origin SPA); dev-only origins |
| Request size | body limits enforced in middleware (6 MB) |
| VPC/egress | not required (Firestore/Gemini are public APIs) |
| Container | built from source by Cloud Run buildpack (Python 3.13), `requirements.txt` pinned; no secrets baked in |

---

## 7. API-layer abuse controls

- Per-user token bucket rate limiting (30 req/min, chat included; configurable).
- Size caps on every input (api-design §24).
- `extra="forbid"` on request models.
- Slow operations (PDF extraction) bounded by timeout + size caps.
- Gemini cost bounded (ai-architecture §11) so abuse cannot run up unbounded spend; billing budget alert configured.
- `requestId` on every response for abuse investigation.

---

## 8. Security test plan

Emulator-first (`firebase emulators:start --only auth,firestore`), real integration smoke in staging.

### 8.1 Token & auth tests (unit/integration)

1. Missing `Authorization` header → 401.
2. Garbage token → 401.
3. Expired token (minted with negative `exp` via emulator) → 401.
4. Token signed by wrong project → 401.
5. Valid emulator token → 200 and correct uid in `AuthContext`.
6. Body claiming a different uid is ignored/rejected (422).

### 8.2 Isolation tests (security suite) — the challenge-critical matrix

| Test | Client | Target | Expect |
|---|---|---|---|
| Unauthenticated → any API | none | all endpoints | 401 |
| A → own conversation | A token | A's cid | 200 |
| A → B's conversation | A token | B's cid | 404 |
| B → A's conversation | B token | A's cid | 404 |
| A → own resource | A token | A's rid | 200 |
| A → B's resource | A token | B's rid | 404 |
| A → own knowledge | A token | A's kid | 200 |
| A → B's knowledge | A token | B's kid | 404 |
| A delete B's conversation | A token | B's cid | 404 |
| A reads B's summaries via cid | A token | B's cid | 404 |

### 8.3 Firestore Security Rules tests (emulator)

- Anonymous client: read/write any path → `PERMISSION_DENIED`.
- Signed-in A: read/write `users/B/...` → `PERMISSION_DENIED`.
- Signed-in A: read/write `users/A/...` → `PERMISSION_DENIED` (yes — deny-all is the rule; the backend does all access).
- Assert the ruleset is exactly deny-all (review + test).

### 8.4 Secret handling tests

- Repo scan: no `GEMINI_API_KEY`-like values in committed files (CI check).
- Response body/log inspection: no key material in any API error, debug log, or traceback.
- Frontend bundle scan: no `GEMINI_API_KEY` string in `dist/`.

### 8.5 Gemini failure tests

- Mock Gemini client raising 429/5xx/timeout → assert 429/502 + persisted user message + retry UX.

### 8.6 Deployment smoke test (staging)

- `curl /healthz` → 200; register → login → chat turn → summary → resource → knowledge flow against deployed Cloud Run + real Secret Manager value.

Run commands: `docs/development-workflow.md` §6.
