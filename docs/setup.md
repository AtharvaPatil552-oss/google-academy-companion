# Setup Guide — Personal Gemini Journal + Knowledge Companion

Step-by-step environment and cloud bootstrap for the Developer agent (and Tester). Follows `docs/architecture.md`. Two contexts: **A) Local/Termux development** and **B) Google Cloud production resources**. Version numbers are checked at the date of writing (2026-09-01) — see `docs/compatibility-matrix.md` for verification sources.

> ⚠️ Prerequisite: a Google account, a Google Cloud project with billing enabled (Secret Manager + Cloud Run + Firestore need billing; Gemini API key via AI Studio is free-tier capable), and a GitHub repo. Firebase project id = GCP project id (or linked).

---

## 1. Repository hygiene (quick)

1. Clone / use this repo on branch `arena/01a05df0-google-academy-companion`.
2. Add to `.gitignore` (Python block — already partially covered, add missing):
   ```gitignore
   # Python
   __pycache__/
   *.py[cod]
   .venv/
   venv/
   .pytest_cache/
   .mypy_cache/
   .ruff_cache/
   .coverage
   htmlcov/
   # Credentials (never commit)
   *service-account*.json
   *credentials*.json
   ```
3. Confirm `.env` and `.env.*` are ignored (already present); `.env.example` files are committed (exception rule exists).

---

## 2. Local development environment (Termux)

```bash
# Base packages
pkg update && pkg upgrade
pkg install python nodejs git openssh
npm install -g firebase-tools gh
# (gcloud on Termux: optional; see §5 note)

# Python backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

**Firebase emulators** (needed for Tester + local integration):

```bash
firebase login
firebase init emulators        # select auth + firestore; accept default ports (9099, 8080)
firebase emulators:start --only auth,firestore
```

---

## 3. Firebase project setup (once)

1. **Create project:** https://console.firebase.google.com → Add project (or use an existing GCP project and Add Firebase).
2. **Enable Firestore:** Build → Firestore Database → Create database → production mode → choose region (e.g. `asia-south1`).
3. **Enable Email/Password auth:** Build → Authentication → Sign-in method → Email/Password → Enable.
4. **Register web app:** Project settings → Your apps → Web app → copy the firebase config:
   ```
   apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
   ```
5. **Firebase CLI project alias:** `firebase use <project-id>`.
6. **Deploy rules + indexes config:**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   (Rules = deny-all per `docs/security-architecture.md` §4.)

---

## 4. Gemini API key (once)

1. Open https://aistudio.google.com/apikey → Create API key → copy.
2. Store locally only: append to `backend/.env`:
   ```
   GEMINI_API_KEY=<your-key>
   GEMINI_MODEL=gemini-3.5-flash   # verify current Flash-tier model id
   ```
3. The same value goes to Secret Manager for production (§5 step 4). Never commit it.

---

## 5. Google Cloud production resources (once)

Requires `gcloud` (install on a workstation/sandbox; or run these from CI):

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>

# 1. IAM service account for Cloud Run (least privilege)
gcloud iam service-accounts create journal-api-sa \
  --display-name="Journal API runtime SA"

# 2. Secret: Gemini API key
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --replication-policy=automatic --data-file=-

# 3. Grant the SA access to the secret ONLY (secret-scoped)
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:journal-api-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

# 4. Firestore access for the SA
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:journal-api-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role=roles/datastore.user

# (Optional, for future token-revocation checks)
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:journal-api-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role=roles/firebaseauth.viewer
```

**Local dev credentials alternative:** download a service-account key from the Firebase console (Project settings → Service accounts → Generate new private key) and point `GOOGLE_APPLICATION_CREDENTIALS` at it **in `.env` only**; keep the file outside the repo (gitignored).

---

## 6. Environment variable files (templates)

`backend/.env.example` (committed):

```bash
# Core
ENVIRONMENT=dev                      # dev | test | prod
GOOGLE_CLOUD_PROJECT=<your-project-id>
PORT=8000

# Gemini
GEMINI_API_KEY=                      # local dev only; Secret Manager in prod
GEMINI_MODEL=gemini-3.5-flash

# Emulators (dev/test only; unset in prod)
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# Local admin credentials (dev only; leave unset to use ADC)
GOOGLE_APPLICATION_CREDENTIALS=

# Limits
MAX_MESSAGE_CHARS=4000
RATE_LIMIT_PER_MINUTE=30
SUMMARY_INTERVAL=6
RESOURCE_MAX_TEXT_CHARS=50000
RESOURCE_MAX_PDF_BYTES=5242880
RESOURCE_MAX_URL_BYTES=2097152
```

`frontend/.env.example` (committed):

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Copy to `.env` locally and fill in real values. **Never commit the filled files.**

---

## 7. Running locally

```bash
# Terminal 1 — emulators
firebase emulators:start --only auth,firestore

# Terminal 2 — backend (needs .env loaded; pydantic-settings reads it from backend/)
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3 — frontend
cd frontend && npm run dev        # http://localhost:5173, /api proxied to :8000
```

Verify: `curl http://localhost:8000/healthz` → `{"status":"ok"}`; open `http://localhost:5173` → register/login (Auth emulator) → chat.

---

## 8. Deploying to Cloud Run (production)

`scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="journal-api"
SA="journal-api-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# 1. Build frontend (static assets are served by FastAPI)
cd frontend && npm ci && npm run build && cd ..

# 2. Deploy (source deploy; Cloud Run buildpack, Python 3.13)
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --service-account "$SA" \
  --allow-unauthenticated \
  --max-instances 10 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},ENVIRONMENT=prod,GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash}" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest"

echo "Deployed: $(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
```

Entrypoint (auto-detected by the buildpack; set explicitly in `backend/Procfile` or the deploy flags if needed):

```bash
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
```

Smoke test after deploy:

```bash
curl -s <URL>/healthz
bash scripts/smoke_e2e.sh <URL>   # register → login → chat → summary → resource → knowledge
```

---

## 9. Troubleshooting quick reference

| Symptom | Cause / fix |
|---|---|
| `verify_id_token` fails locally | Set `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` in `.env` and use emulator-created accounts |
| Firestore writes fail locally | `FIRESTORE_EMULATOR_HOST` unset → Admin SDK hits prod; set it to `localhost:8080` |
| 401 in browser while logged in | Token expired; client should auto-refresh; check clock skew between browser and server |
| 429 immediately | Rate limit too low for testing — raise `RATE_LIMIT_PER_MINUTE` in dev |
| PDF upload 413 | File > 5 MB; reduce or raise `RESOURCE_MAX_PDF_BYTES` in dev |
| Deployment: "secret not found" | Secret name/version mismatch or SA lacks `secretAccessor` binding on that secret |
| Deployment: port errors | Entrypoint must read `$PORT`; do not hardcode 8080 |
| Gemini model not found | `GEMINI_MODEL` id deprecated/renamed — check `docs/compatibility-matrix.md` §6 changelog |
| Emulator port busy | Change in `firebase.json` and env vars together |
