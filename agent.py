import os
import sys
import json
import glob
import time
import subprocess
import urllib.request
import urllib.error

def load_env_file():
    """Pure Python .env parser."""
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip('"').strip("'")

load_env_file()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("❌ Error: GEMINI_API_KEY not found in .env")
    sys.exit(1)

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"

def get_lean_workspace():
    """Reads only relevant active Python/HTML files to minimize payload and maximize speed."""
    files_to_read = glob.glob("app/**/*.py", recursive=True) + glob.glob("app/**/*.html", recursive=True)
    context = {}
    for f in files_to_read:
        try:
            with open(f, "r") as fh:
                context[f] = fh.read()
        except Exception:
            pass
    return context

def run_agent(task_prompt: str):
    start_time = time.time()
    print(f"\n⚡ [Turbo Agent Active] Task: {task_prompt}")
    print("🔍 Inspecting workspace (lean scan)...")
    workspace = get_lean_workspace()
    
    system_instruction = {
        "parts": [{
            "text": "You are the high-speed autonomous coding engineer for Google Academy Companion. "
                    "Write production-grade, concise, pure-Python code for Termux compatibility. "
                    "Output ONLY valid JSON matching the requested schema. No markdown wrapping."
        }]
    }

    user_content = f"""
Existing Files:
{json.dumps(workspace)}

TASK: {task_prompt}

Respond with ONLY valid JSON:
{{
  "room": "ROOM 3 — DEVELOPMENT",
  "agent": "Agent 3.x (Specialist)",
  "thought": "Brief description of changes",
  "files_to_write": [
    {{
      "path": "app/...",
      "content": "full content"
    }}
  ],
  "commit_message": "git commit message"
}}
"""

    payload = {
        "contents": [{"parts": [{"text": user_content}]}],
        "system_instruction": system_instruction,
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1
        }
    }

    headers = {"Content-Type": "application/json"}
    print("🧠 Querying Gemini 3.6 Flash...")

    req = urllib.request.Request(
        GEMINI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            result = json.loads(raw_text)
    except Exception as e:
        print(f"❌ Error: {e}")
        return

    elapsed = round(time.time() - start_time, 2)
    print(f"\n⚡ Generated in {elapsed}s!")
    print(f"🏠 Room: {result.get('room')}")
    print(f"🤖 Agent: {result.get('agent')}")
    print(f"💡 Plan: {result.get('thought')}\n")

    for item in result.get("files_to_write", []):
        path = item["path"]
        content = item["content"]
        if os.path.dirname(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        print(f"  ✍️ [Written]: {path}")

    commit_msg = result.get("commit_message", "update from agent")
    subprocess.run(["git", "add", "."], capture_output=True)
    subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True)
    print(f"  🌿 [Git Committed]: {commit_msg}")
    print(f"\n🎉 Finished autonomously in {elapsed}s!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py \"<YOUR TASK PROMPT>\"")
        sys.exit(1)
    run_agent(" ".join(sys.argv[1:]))
