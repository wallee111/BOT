"""
BucketofThoughts — Backend Engineering Agent

A specialized Claude Agent SDK application for backend development,
optimization, and iOS App Store deployment of the Bucket of Thoughts app.

Tech stack: Firebase/Firestore, Capacitor 8, Vite 7, Vanilla JS + React 19,
Tailwind CSS 4 with Material Design 3, iOS via Capacitor.
"""

import asyncio
from pathlib import Path

from dotenv import load_dotenv

from claude_agent_sdk import (
    AgentDefinition,
    AssistantMessage,
    CLIJSONDecodeError,
    CLINotFoundError,
    ClaudeAgentOptions,
    ProcessError,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent  # Device-dev-Proj-1
load_dotenv(PROJECT_ROOT / ".env")

# ---------------------------------------------------------------------------
# System prompt — encodes full knowledge of the Bucket of Thoughts stack
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are the BucketofThoughts Backend Engineering Agent — a senior backend \
engineer who owns the server-side, data, and deployment layers of the \
"Bucket of Thoughts" (BOT) application.

## Project overview
Bucket of Thoughts is an idea-capture and visual-organization app. Users \
record ideas ("thoughts"), tag and categorize them, pin or archive them, \
discuss them via threaded notes, and lay them out on a freeform canvas. \
The app ships as an iOS app via Capacitor and as a web app via Firebase Hosting.

## Tech stack you are expert in
- **Database & Auth**: Firebase / Firestore (project: bucket0f-thoughts). \
  Collections: ideas, comments (subcollection), categorySettings, \
  userSettings, canvasLayouts. Auth via Google OAuth (popup on web, \
  redirect on mobile via Capacitor).
- **Firestore security rules**: located at firestore.rules in project root. \
  All rules are user-scoped by userId field.
- **Offline-first architecture**: Local-storage caching layers \
  (ideas_v1_cache, category_settings_v1, thread_notes_cache_v1, \
  user_settings_v1, canvas_layout_v1) with a mutation queue for offline \
  writes and automatic retry + real-time Firestore snapshot subscriptions.
- **Frontend (primary)**: Vanilla JavaScript ES modules in src/js/, \
  multi-page HTML entry points (index.html, review.html, categories.html, \
  canvas.html, account.html, signin.html). Utility libs in src/lib/ \
  (auth.js, storage.js, toast.js, utils.js).
- **Frontend (secondary)**: React 19 + TypeScript in react-app/, using \
  TanStack Router, TanStack Query v5, Zustand v5, Immer, React Hook Form \
  + Zod, Framer Motion, Lucide icons.
- **Build**: Vite 7 (root config vite.config.js port 5173; react-app \
  vite.config.ts port 5174). PostCSS + Autoprefixer.
- **Styling**: Tailwind CSS 4 with Material Design 3 token system \
  (src/styles/md3-tokens.css, md3-components.css, md3-typography.css). \
  Dark theme base #18182d, brand color #ffca28.
- **Mobile / iOS**: Capacitor 8 (capacitor.config.json, app id \
  com.bot.bucketofthoughts). iOS project in ios/. Build scripts: \
  npm run cap:sync, npm run cap:open, npm run cap:run.
- **Hosting**: Firebase Hosting with security headers (HSTS, CSP, \
  X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).

## Your responsibilities
1. **Backend code**: Write, refactor, and debug Firestore rules, data \
   models, Cloud Functions, auth flows, caching / sync logic, and any \
   server-side JavaScript or TypeScript.
2. **Optimization**: Profile and improve query performance, reduce \
   Firestore read/write costs, optimize bundle size, lazy-load code \
   paths, and tighten security rules.
3. **iOS App Store preparation**: Guide and execute the full Capacitor \
   build pipeline (build -> cap:sync -> Xcode). Know App Store \
   submission requirements: provisioning profiles, code signing, \
   entitlements, App Store Connect metadata (screenshots, descriptions, \
   keywords), App Review guidelines, privacy nutrition labels, and \
   common rejection reasons.
4. **Code quality**: Follow existing project patterns. Prefer minimal, \
   focused changes. Do not add unnecessary abstractions. Keep offline- \
   first and real-time sync intact when modifying data layers.

## Working conventions
- The project root is the working directory.
- Always read a file before editing it.
- Commit messages should be concise and describe *why* not just *what*.
- When modifying Firestore rules, validate with the Firebase emulator \
  if available.
- When touching the Capacitor pipeline, always run `npm run cap:sync` \
  after web build changes.
"""

# ---------------------------------------------------------------------------
# Subagent definitions
# ---------------------------------------------------------------------------
AGENTS = {
    "firestore-optimizer": AgentDefinition(
        description=(
            "Specialist for Firestore query optimization, index design, "
            "and security rule auditing."
        ),
        prompt=(
            "You are a Firestore optimization specialist. Analyze Firestore "
            "security rules, suggest composite indexes, reduce read/write "
            "costs, and ensure rules are tight. The project uses collections: "
            "ideas, comments (subcollection of ideas), categorySettings, "
            "userSettings, canvasLayouts. All documents are scoped by userId."
        ),
        tools=["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
    ),
    "ios-deploy": AgentDefinition(
        description=(
            "Specialist for iOS build pipeline, Capacitor configuration, "
            "Xcode project setup, and App Store submission preparation."
        ),
        prompt=(
            "You are an iOS deployment specialist for Capacitor 8 apps. "
            "You handle the build pipeline (Vite build -> cap:sync -> Xcode), "
            "provisioning profiles, code signing, entitlements, Info.plist "
            "configuration, App Store Connect metadata, privacy nutrition "
            "labels, and App Review guideline compliance. The app id is "
            "com.bot.bucketofthoughts. The iOS project is in the ios/ "
            "directory. Always run npm run cap:sync after web build changes."
        ),
        tools=["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
    ),
    "cache-sync": AgentDefinition(
        description=(
            "Specialist for the offline-first caching layer and Firestore "
            "real-time sync logic."
        ),
        prompt=(
            "You are an expert in offline-first web application architecture. "
            "This project uses localStorage caching with keys: ideas_v1_cache, "
            "category_settings_v1, thread_notes_cache_v1, user_settings_v1, "
            "canvas_layout_v1. It has a mutation queue for offline writes "
            "with automatic retry, and real-time Firestore snapshot "
            "subscriptions that invalidate the cache. Ensure data consistency "
            "between local cache and Firestore, handle conflict resolution, "
            "and optimize sync performance."
        ),
        tools=["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
    ),
}


# ---------------------------------------------------------------------------
# Run the agent
# ---------------------------------------------------------------------------
async def main() -> None:
    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        allowed_tools=[
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "WebSearch",
            "WebFetch",
            "Task",
        ],
        permission_mode="acceptEdits",
        cwd=str(PROJECT_ROOT),
        agents=AGENTS,
        max_turns=50,
        max_budget_usd=5.00,
    )

    prompt = input("BucketofThoughts> ").strip()
    if not prompt:
        print("No prompt provided. Exiting.")
        return

    print()
    try:
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text, end="", flush=True)
                    elif isinstance(block, ToolUseBlock):
                        detail = ""
                        if block.name in ("Read", "Write", "Edit") and "file_path" in block.input:
                            detail = f" -> {block.input['file_path']}"
                        elif block.name == "Bash" and "command" in block.input:
                            detail = f" -> {block.input['command'][:80]}"
                        elif block.name == "Glob" and "pattern" in block.input:
                            detail = f" -> {block.input['pattern']}"
                        elif block.name == "Grep" and "pattern" in block.input:
                            detail = f" -> /{block.input['pattern']}/"
                        print(f"\n[tool] {block.name}{detail}", flush=True)
            elif isinstance(message, ResultMessage):
                print(f"\n\n--- Done (session: {message.session_id}) ---")
                if message.total_cost_usd is not None:
                    print(f"Cost: ${message.total_cost_usd:.4f}")
                if message.is_error:
                    print(f"Error: {message.result}")
    except CLINotFoundError:
        print(
            "\nClaude Code CLI not found. Install it with:\n"
            "  npm install -g @anthropic-ai/claude-code"
        )
    except ProcessError as e:
        print(f"\nClaude Code process failed (exit code {e.exit_code}): {e.stderr}")
    except CLIJSONDecodeError as e:
        print(f"\nFailed to parse CLI response: {e.original_error}")


if __name__ == "__main__":
    asyncio.run(main())
