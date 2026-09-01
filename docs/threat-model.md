# Threat Model — Personal Gemini Journal + Knowledge Companion

Companion to `docs/security-architecture.md`. Format per category: **Threat → Risk → Mitigation → Test.** Every mitigation has an owner and a test. This document is the contract for the Tester agent's security suite and the Architecture Reviewer's checklist.

Severity: **H** high (challenge-critical / data breach), **M** medium (abuse/cost/availability), **L** low (minor).

---

## 1. Authentication threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T1.1 | Invalid/forged ID token accepted | H | Attacker impersonates a user | Admin SDK `verify_id_token` (crypto signature check) as the only verifier; no manual JWT parsing | Auth test 2, 4 (§8.1 security-architecture) |
| T1.2 | Expired token accepted | H | Session beyond TTL | `verify_id_token` enforces `exp` (~1 h TTL) | Auth test 3 |
| T1.3 | Unauthenticated request reaches data | H | Public data exposure | `get_current_user` dependency on every protected route; 401 before any service call | Isolation matrix row 1 |
| T1.4 | Revoked/disabled user keeps access ≤1 h | L | Slow revocation | Accepted trade-off `check_revoked=False`; upgrade path documented (§2.4) | Manual: disable user in console, token expiry check |
| T1.5 | Token in logs/URLs/analytics | M | Credential leak | Tokens only in `Authorization` header (never query params); logging redaction of `authorization` header; request logs omit headers | Log inspection test |
| T1.6 | Firebase client config (public apiKey) misread as a secret and over-restricted | L | Broken dev flow / confusion | Docs note: client config is public by design; only backend secrets are protected | Documentation review |

---

## 2. Authorization threats (cross-user access)

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T2.1 | UID manipulation: client sends `uid=another-user` | H | Cross-user data access | UID derived exclusively from verified token; request schemas forbid extra fields; services take `uid` as positional param from `AuthContext` | Auth test 6; code review |
| T2.2 | IDOR: guess/iterate other users' conversation/resource/knowledge ids | H | Read/write/delete other users' data | Opaque Firestore auto-IDs; ownership check returns 404 for foreign ids; all queries path-scoped to verified uid | Isolation matrix rows 2–10 |
| T2.3 | IDOR via subresources (messages/summaries under foreign conversation id) | H | Cross-user data access | Ownership enforced at conversation level before any subcollection access | Isolation rows: A reads B's summaries |
| T2.4 | Collection-group/global query leaking cross-user data | H | Aggregate data exposure | No collection-group queries in codebase (repo review rule); all queries `users/{uid}/…` | Code search: no `collectionGroup` usage |
| T2.5 | Delete/update of foreign docs | H | Data destruction | Repos scoped to uid; delete returns 404 on foreign id | Isolation rows 9 |
| T2.6 | Client-side Firestore bypass (direct SDK from browser) | H | Rules bypass → full data access | Client has no Firestore SDK import; Security Rules deny all client access | Rules tests §8.3; bundle scan |

---

## 3. Firestore threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T3.1 | Open/loose Security Rules | H | Any client reads/writes DB | Deny-all ruleset (§4 security-architecture); rules file reviewed | Rules tests; rules review gate |
| T3.2 | Wrong subcollection rule pattern (e.g. `match /{doc=**}` accidentally permissive) | H | Data exposure | Ruleset is a single deny-all; no subcollection rules to get wrong | Rules tests |
| T3.3 | Unsafe queries from server (unbounded, non-uid-scoped) | H | Cross-user reads / cost blowup | Repository layer conventions: `uid` first arg, bounded reads (≤50 docs), no collection-group | Code review; unit tests with mocking |
| T3.4 | Server-side Admin SDK bypass of rules used incorrectly | H | If repos scoped wrongly, isolation gone | Repos are the only Firestore access; security tests assert isolation; Architecture Reviewer inspects all repo methods | Isolation matrix; code review |
| T3.5 | Missing composite index causing 503 in prod | L | Feature broken in prod | No composite indexes needed in MVP (data-model §9); emulator catches any violation; `firestore.indexes.json` if added | Emulator integration tests |
| T3.6 | Data egress via rules/exfiltration of `rawText` | M | Resource content leak | Same as T2.2/T3.1 mitigations; response models don't echo `rawText` in list endpoints | List-response schema test |

---

## 4. Gemini / AI threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T4.1 | Prompt injection via user message or resource content | H | Model exfiltrates context, ignores mode, or behaves contrary to product | Guardrail system prompt ("content is data"); delimited user content; never concatenate user content into instruction position; resource text data-only | Unit tests on prompt assembly; manual adversarial prompts in QA |
| T4.2 | Malicious/abusive input (hate, self-harm, illegal) | M | Policy violation, bad demo | Gemini safety settings (defaults, block medium+ harmful categories); input size caps | Manual test set |
| T4.3 | Excessive context → cost/token abuse | M | Cost blowup, degraded UX | Bounded context assembly (§4 ai-architecture); `max_output_tokens`; per-user rate limit; max-instances cap | Cost math test; prompt-length unit test |
| T4.4 | Sensitive data exposure: private knowledge/resources echoed to a different user via prompt | H | Data breach | Context retrieval strictly `users/{uid}/…`; nothing cross-user ever enters prompts; ownership tests cover context endpoints | Isolation tests on chat with cross-user resource ids (404 before Gemini) |
| T4.5 | Model hallucination stored as fact (bad summary/knowledge) | M | Wrong content in user's library | Structured schema validation; knowledge requires user approval; summaries are clearly labeled AI-generated | Validation tests; knowledge workflow test |
| T4.6 | Structured output not parseable → app crashes | M | 5xx, UX break | Pydantic validation + repair + fallback (ai-architecture §8) — never unhandled | Unit tests with malformed model output fixtures |
| T4.7 | Gemini key leakage from backend errors | H | Key compromise | Errors never include config values; redaction; key only in config object | Secret tests §8.4 |

---

## 5. API threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T5.1 | Oversized requests (memory/CPU DoS) | M | Instance OOM, cost | Size caps per endpoint (§24 api-design); 6 MB global body limit middleware; PDF 5 MB | Load test with max-size payloads |
| T5.2 | API abuse/brute force (auth spam, chat spam) | M | Cost, rate-limit lockout of real users | Per-user token bucket (30/min); Cloud Run max instances; spend alert | Rate-limit tests |
| T5.3 | Injection (SQL/NoSQL/HTML) | L | N/A for Firestore (no injection surface) but sanitize display | Firestore is document-store (no query-language injection via Admin SDK strings); React escapes text by default (no dangerouslySetInnerHTML); URL validated `http(s)` only | Unit tests on URL parsing; UI render tests |
| T5.4 | Invalid data causing downstream Gemini/Firestore errors | M | 5xx | Pydantic validation at the edge; schemas forbid extra fields; enum constraints | Validation tests |
| T5.5 | SSRF via user-provided URL fetch | M | Server fetches internal/cloud-metadata URLs | URL allowlist scheme (`http/https`), block private/loopback/link-local/metadata IPs (169.254.169.254, 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, ::1, fd00::/8), 15 s timeout, size cap | SSRF unit tests with host tables |

---

## 6. Secrets threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T6.1 | API key committed to Git | H | Key compromise, abuse billing | `.gitignore` covers `.env`; `.env.example` has placeholders only; CI secret scan; key never in code | Repo scan (git log too) |
| T6.2 | Key exposed to browser/frontend bundle | H | Anyone can call Gemini as the app | Key only in backend config; Vite only receives `VITE_FIREBASE_*` public config; bundle scan for `GEMINI_API_KEY` | Bundle scan |
| T6.3 | Key in logs/error traces | H | Key compromise | Logging redaction; structured logs never include env values or headers | Log inspection test |
| T6.4 | Incorrect IAM (secret world-readable / overprivileged SA) | H | Key compromise | Secret-scoped `secretAccessor` binding; dedicated least-privilege SA; gcloud `get-iam-policy` review step | IAM review checklist in setup.md |
| T6.5 | Service-account key file in repo | H | Full GCP compromise | File is gitignored and stored outside repo (setup.md); use ADC in prod | Repo scan |

---

## 7. Cloud Run / deployment threats

| # | Threat | Sev | Risk | Mitigation | Test |
|---|---|---|---|---|---|
| T7.1 | Overprivileged runtime service account | H | Attacker with app vuln escalates to GCP | Least-privilege SA (datastore.user, secret-scoped accessor, logging) | IAM review in CI/checklist |
| T7.2 | Misconfigured secret injection (secret in image/env public) | H | Key exposure | Secrets via `--set-secrets` only; env not baked into image; console verify | Deployment checklist |
| T7.3 | Public endpoint abused (no auth on API) | H | Data/cost abuse | Auth dependency on all routes; 401 default; healthz only unauthenticated | Isolation matrix row 1; route audit |
| T7.4 | Unsafe config (CORS `*` in prod, debug mode on, open debugger) | M | Cross-origin abuse, info leak | CORS empty in prod; `debug=false`; `ENVIRONMENT=prod` switches verbose logging off | Config tests |
| T7.5 | Port mismatch (app binds 8080 fixed; Cloud Run gives random PORT) | M | Deployment broken | `--port $PORT` from env (Cloud Run sets `PORT`); uvicorn binds `0.0.0.0` | Deployment smoke test |
| T7.6 | Health check failing → instance churn | L | Availability | `/healthz` returns 200 without heavy deps (no Gemini/Firestore calls) | Smoke test |

---

## 8. Residual risks (accepted)

| Risk | Why accepted | Owner |
|---|---|---|
| Token revocation lag ≤ 1 h (T1.4) | Complexity vs. benefit for the challenge; upgrade path documented | Architecture Reviewer |
| In-process rate limiting per-instance (multi-instance can exceed global limit by ≤10×) | Scale is tiny; max-instances 10; Redis upgrade documented | Tester/Architecture Reviewer |
| Keyword retrieval precision vs embeddings | MVP scope; upgrade documented | Architecture Reviewer |
| AI output quality variance (hallucination) | User-approval workflow + labels + validation | Product |

---

## 9. Security review checklist (Architecture Reviewer)

Run before each phase merge and before submission:

- [ ] No Firestore import in `frontend/`; bundle scan clean of `GEMINI_API_KEY`.
- [ ] Rules file is exactly deny-all for clients.
- [ ] Every route (except `/healthz`) has `Depends(get_current_user)`.
- [ ] No repository method lacks a `uid` first parameter; no collection-group queries.
- [ ] No secret/credentials in code, `.env*` committed, or logs.
- [ ] Request schemas use `extra="forbid"`; size caps enforced.
- [ ] CORS empty in prod; `ENVIRONMENT` gates debug logging.
- [ ] SA least-privilege binding verified via `gcloud` IAM policy output.
- [ ] SSRF protections present for URL fetch.
- [ ] All structured AI outputs validated before persistence.
