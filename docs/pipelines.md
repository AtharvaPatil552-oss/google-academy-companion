# Pipelines — Visual Diagrams (Mermaid)

Companion to `docs/architecture.md`. All 12 pipelines as Mermaid `flowchart` diagrams. These diagrams are the canonical reference for the Developer agent; implementation must match the flows.

---

## 1. Authentication pipeline

```mermaid
flowchart LR
    U[User] -->|email + password| R[React Firebase Auth]
    R -->|signInWithEmailAndPassword| FA[Firebase Authentication]
    FA -->|ID token JWT| R
    R -->|API request<br/>Authorization: Bearer token| API[FastAPI route]
    API -->|Depends get_current_user| VER[verify_id_token<br/>signature + exp + aud]
    VER -->|valid| UID[Extract uid from claims]
    VER -->|invalid / expired| E1[401 unauthenticated]
    UID --> AUTHZ{Authorization<br/>ownership scoping}
    AUTHZ -->|operation scoped to uid| OP[Requested operation]
    AUTHZ -->|foreign id| E2[404 not_found]
```

## 2. Journal pipeline

```mermaid
flowchart LR
    U[User writes message] --> R[React<br/>client validation]
    R -->|POST /conversations/:id/messages| API[FastAPI]
    API --> V[Verify user]
    V --> CS[Conversation service]
    CS --> GS[Gemini service]
    GS --> G[Gemini API]
    G -->|AI response| GS
    GS --> CS
    CS --> P[Persist conversation / messages<br/>users/:uid/conversations/:cid/messages]
    P --> RESP[Return response to React]
```

## 3. Multi-turn conversation pipeline

```mermaid
flowchart LR
    U[Message 3] --> API[Authenticated API request]
    API --> CC{Context manager}
    CC --> S[Rolling summary<br/>if exists]
    CC --> RM[Recent messages<br/>last 10]
    CC --> K[Relevant knowledge<br/>top 3, user-scoped]
    CC --> R[Relevant resources<br/>top 2, user-scoped]
    S --> CTX[Assembled bounded context]
    RM --> CTX
    K --> CTX
    R --> CTX
    CTX --> G[Gemini]
    G --> RESP[Response 3]
    RESP --> P[Persist messages]
```

## 4. Summary pipeline

```mermaid
flowchart LR
    CONV[Conversation<br/>messageCount since lastSummary >= 6]
    TRIG[Background task or manual summarize] --> SUM[Summary service]
    SUM --> PREV[Previous summary + new messages]
    PREV --> G[Gemini structured call<br/>response_schema]
    G --> VAL{Pydantic validation}
    VAL -->|valid| FS[Firestore<br/>users/:uid/conversations/:cid/summaries/:sid]
    VAL -->|invalid| REP[Repair attempt x1]
    REP --> VAL2{Pydantic validation}
    VAL2 -->|valid| FS
    VAL2 -->|invalid| LOG[Log + skip<br/>retry next trigger]
    FS --> UPD[Update conversation<br/>lastSummaryAt / messageIndex]
```

## 5. Resource pipeline

```mermaid
flowchart LR
    RES[Resource<br/>text / url / pdf / note] --> FRONT[Frontend]
    FRONT -->|POST /resources| API[Authenticated FastAPI request]
    API --> IV[Input validation<br/>type + size caps + URL checks]
    IV -->|invalid| E[422 / 413 / 415]
    IV --> EX[Content extraction<br/>URL fetch httpx / PDF pypdf]
    EX --> STORE[Resource storage<br/>Firestore, status=pending]
    STORE --> G[Gemini analysis<br/>structured metadata]
    G --> VAL[Pydantic validation]
    VAL -->|valid| AN[Store analysis<br/>status=completed]
    VAL -->|invalid| RET[Repair / retry]
    VAL -->|fail| FAIL[status=failed<br/>friendly error]
```

## 6. Knowledge pipeline

```mermaid
flowchart LR
    SRC[Conversation / Resource] --> G[Gemini extraction<br/>schema: knowledge candidates]
    G --> VAL[Schema validation]
    VAL -->|valid| FS[Firestore<br/>users/:uid/knowledge/:kid<br/>status=pending]
    VAL -->|invalid| DROP[Drop candidates + log]
    FS --> UI[UI shows suggestions]
    UI -->|approve / edit+approve / reject| ST[Status updated<br/>approved enters retrieval pool]
    UI -->|manual create| MAN[status=approved]
```

## 7. Recommendation pipeline (optional)

```mermaid
flowchart LR
    DATA[User knowledge + resources<br/>+ latest summary] --> CTX[Context selection<br/>user-scoped]
    CTX --> G[Gemini]
    G --> VAL[Validation]
    VAL --> REC[Recommendation<br/>users/:uid/recommendations/:rid]
    REC --> USR[User]
    G -->|fail| E[503 + non-fatal empty state]
```

## 8. Voice pipeline (optional, post-MVP)

```mermaid
flowchart LR
    MIC[Microphone] --> REC2[Browser MediaRecorder<br/>audio capture]
    REC2 --> AI[Gemini audio input<br/>current model capability check]
    AI --> PIPE[Existing Gemini pipeline]
    PIPE --> TTS[Text-to-speech<br/>browser speechSynthesis or Gemini TTS]
    TTS --> OUT[Voice output]
```

## 9. Secrets pipeline

```mermaid
flowchart LR
    CR[Cloud Run] -->|--set-secrets=<br/>GEMINI_API_KEY=gemini-api-key:latest| SM[Secret Manager<br/>secret: gemini-api-key]
    SM -->|env var at runtime| API[FastAPI config]
    API --> GS[Gemini service]
    GS --> G[Gemini API]
    DEV[Local dev] -->|.env gitignored| API
```

## 10. Deployment pipeline

```mermaid
flowchart LR
    GH[GitHub<br/>feature branch] -->|git push| CI[gcloud builds submit<br/>source deploy]
    CI -->|Cloud Run buildpack<br/>Python 3.13 + FastAPI| RUN[Cloud Run<br/>journal-api]
    RUN --> PROD[Production API]
    SEC[Secret Manager] -->|injected env| RUN
    SMOKE[Smoke tests<br/>healthz + auth + chat] --> PROD
```

## 11. AI context pipeline

```mermaid
flowchart LR
    Q[User question] --> AUTH[Authentication<br/>verified uid]
    AUTH --> CC[Conversation context]
    AUTH --> PR[Relevant private resources]
    AUTH --> PK[Relevant knowledge]
    AUTH --> PS[Relevant summary]
    CC --> SEL[Context selection<br/>bounded + scoped]
    PR --> SEL
    PK --> SEL
    PS --> SEL
    SEL --> G[Gemini]
    G --> RESP[Response]
```

## 12. Progress pipeline (future)

```mermaid
flowchart LR
    ACT[User action] --> VAL[Validation]
    VAL --> PROG[Progress service]
    PROG --> FS[Firestore<br/>users/:uid/progress/:pid]
    FS --> RC[Recommendation context]
```
