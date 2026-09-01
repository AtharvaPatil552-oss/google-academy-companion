# Setup & Installation Guide

## Prerequisites
- Android device with Termux installed
- Google Account with Google AI Studio Gemini API access
- Firebase Project configured (Auth + Firestore)

## Local Development Setup (Termux)
1. Install dependencies:
   pkg update && pkg upgrade -y
   pkg install git python -y

2. Clone repository:
   git clone https://github.com/AtharvaPatil552-oss/google-academy-companion.git
   cd google-academy-companion

3. Configure Environment Variables in .env:
   GEMINI_API_KEY=your_gemini_api_key_here

4. Install Python Libraries:
   pip install google-genai firebase-admin python-dotenv
