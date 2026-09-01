# System Architecture — Google Academy Companion

## Overview
Google Academy Companion is an AI-powered assistant designed to assist learners with Google Academy materials, leveraging Gemini models, Firebase Authentication, and Firestore.

## Components & Tech Stack
- **Backend / Engine:** Python 3 (FastAPI / Flask)
- **AI Engine:** Google AI Studio (Gemini Python SDK)
- **Database:** Firebase Firestore (Firebase Admin Python SDK)
- **Authentication:** Firebase Authentication (Email/Password)
- **Environment:** Local development in Termux, deployed on Cloud
- **Secrets Management:** Python `.env` via `python-dotenv`

## Data Flow
1. **User Authentication:** Client authenticates via Firebase Auth.
2. **User Request:** Authenticated request sent to Python backend.
3. **AI Generation:** Python backend queries Gemini API with learning context.
4. **Persistence:** Interactions and progress saved to Firestore via Admin SDK.
5. **Response:** Response streamed/returned to the client.
