# google-academy-companion

AI-powered personal journal + knowledge & resource companion built for the Google Academy challenge.

**Personal Gemini Journal** (mandatory challenge functionality):
Firebase Authentication · real multi-turn Gemini conversations · automatic conversation summaries · private Cloud Firestore persistence · zero cross-user data leakage · API keys secured via Google Cloud Secret Manager · production deployment on Cloud Run.

**Original enhancement:** transform useful conversations and external learning resources (text, URLs, PDFs, notes) into a structured, private **personal knowledge/resource library** with AI analysis, knowledge extraction, and an approve/edit workflow.

## Architecture

The complete technical architecture is designed and documented in [`docs/`](docs/):

| Document | Contents |
|---|---|
| [architecture.md](docs/architecture.md) | Master architecture: decisions, components, MVP/enhancement split, risks |
| [system-design.md](docs/system-design.md) | Component & directory design, config, environments |
| [data-model.md](docs/data-model.md) | Firestore schema, ownership, authorities, indexes |
| [api-design.md](docs/api-design.md) | REST API endpoints, schemas, errors |
| [ai-architecture.md](docs/ai-architecture.md) | Gemini integration, multi-turn context, summaries, validation |
| [security-architecture.md](docs/security-architecture.md) | Auth, authorization, rules, secrets, Cloud Run hardening |
| [threat-model.md](docs/threat-model.md) | Threat → risk → mitigation → test for every category |
| [pipelines.md](docs/pipelines.md) | Mermaid diagrams of all pipelines |
| [compatibility-matrix.md](docs/compatibility-matrix.md) | Versioned compatibility matrix (official sources) |
| [development-workflow.md](docs/development-workflow.md) | Agent boundaries, phases, tests, definition of done |
| [setup.md](docs/setup.md) | Environment & cloud bootstrap, step by step |

## Stack

React + Vite (frontend) · Python + FastAPI (backend) · Firebase Authentication · Cloud Firestore (server-only access) · Gemini API via the official `google-genai` SDK · Google Cloud Secret Manager · Google Cloud Run.

## Status

Architecture phase — implementation follows the phased plan in `docs/development-workflow.md`. Work is tracked on branch `arena/01a05df0-google-academy-companion`.
