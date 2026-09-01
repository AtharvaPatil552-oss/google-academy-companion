import os
import sys
import json
import glob
import subprocess
import urllib.request
import urllib.error

def load_env_file():
    """Built-in pure Python .env parser (No external packages needed!)."""
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

def get_workspace_context():
    """Inspects all code files in the repo."""
    files_to_read = glob.glob("app/**/*.py", recursive=True) + glob.glob("app/**/*.html", recursive=True) + ["docs/organization.md"]
    context = {}
    for f in files_to_read:
        try:
            with open(f, "r") as fh:
                context[f] = fh.read()
        except Exception:
            pass
    return context

def run_agent(task_prompt: str):
    print(f"\n🤖 [Termux Multi-Agent CLI] Task: {task_prompt}")
    print("🔍 [Room 10 / Room 3] Inspecting workspace files...")
    workspace = get_workspace_context()
    
    system_prompt = f"""
You are the Autonomous Multi-Agent Engineer running in Termux for Google Academy Companion.
You follow the rules in docs/organization.md.

Current Workspace:
{json.dumps(workspace, indent=2)}

TASK: {task_prompt}

CRITICAL RULES:
1. Python backend should use lightweight Flask or pure Python to avoid Rust/C compilation on Termux.
2. Respond with ONLY a JSON object (no markdown wrapping, no ```json tags).

JSON SCHEMA:
{{
  "room": "ROOM 3 — DEVELOPMENT",
  "agent": "Agent 3.3 (Authentication Engineer)",
  "thought": "Short explanation of the code written",
  "files_to_write": [
    {{
      "path": "app/services/firebase_service.py",
      "content": "file content here"
    }}
  ],
  "commit_message": "feat(auth): implement firebase token verification"
}}
"""
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": system_prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"}
    }

    print("🧠 [Room 1 & 3] Consulting Gemini 2.0 Flash Engine...")
    req = urllib.request.Request(
        GEMINI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            result = json.loads(raw_text)
    except urllib.error.HTTPError as e:
        print(f"❌ Gemini API Error ({e.code}): {e.read().decode('utf-8')}")
        return
    except Exception as e:
        print(f"❌ Agent Execution Error: {e}")
        return

    print(f"\n🏠 Active Room: {result.get('room')}")
    print(f"🤖 Active Agent: {result.get('agent')}")
    print(f"💡 Execution Plan: {result.get('thought')}\n")

    # 1. Write Files Directly to Termux Disk
    for item in result.get("files_to_write", []):
        path = item["path"]
        content = item["content"]
        if os.path.dirname(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        print(f"  ✍️ [Written to Disk]: {path}")

    # 2. Stage & Commit to Git Automatically
    commit_msg = result.get("commit_message", "update from termux agent")
    subprocess.run(["git", "add", "."], capture_output=True)
    subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True)
    print(f"  🌿 [Git Committed]: {commit_msg}")
    print("\n🎉 Task completed autonomously inside your Termux terminal!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py \"<YOUR TASK PROMPT>\"")
        sys.exit(1)
    run_agent(" ".join(sys.argv[1:]))
