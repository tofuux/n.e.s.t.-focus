# N.E.S.T. Focus — Implementation Guide

This app has a **Vite + React** frontend and a small **Node (Express) + PostgreSQL** API that talks to **Ollama** for meeting help and end-of-meeting summaries. There is **no authentication**; everything assumes a **single user** on your machine.

## Architecture

| Piece | Role |
|--------|------|
| Frontend (`npm run dev`) | Camera + microphone via `getUserMedia` (no screen capture), WebM recording from that stream, live transcript (Chrome Web Speech API), Help / Calm actions |
| API (`server/`, port `3001`) | Health check, Ollama prompts, Postgres persistence for meetings |
| Ollama | LLM for “what should I say?” and structured meeting summary (JSON) |
| PostgreSQL | Stores transcript, summary, decisions, and action items per meeting |

**Note:** Live transcription uses the **browser’s speech recognition** (in Chrome, this uses Google’s speech service). The **recording** is local WebM (camera + your mic). For a fully offline transcript later, you can add Whisper or another STT service and replace the speech layer only.

## Prerequisites

- **Node.js** 18+ (for `fetch` in the API and `node --watch`)
- **PostgreSQL** 14+ (with `pgcrypto` for `gen_random_uuid`)
- **Ollama** installed and a model pulled (e.g. `llama3.2`)
- **Chrome** (recommended) for speech recognition and media capture

## 1. Install dependencies

From the **repository root**:

```bash
npm install
```

From **`server/`**:

```bash
cd server
npm install
cd ..
```

## 2. Create the database

Create a database and run the schema (adjust user/password as you like):

```bash
# Example: using psql
createdb nest_focus
psql -d nest_focus -f server/db/init.sql
```

Or open `server/db/init.sql` in any SQL client connected to `nest_focus` and execute it.

## 3. Configure the API

Copy the example env file and edit values:

```bash
copy server\.env.example server\.env
```

On macOS/Linux:

```bash
cp server/.env.example server/.env
```

Set **`DATABASE_URL`**, for example:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nest_focus
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
PORT=3001
```

**Ollama model:** Pull the model you reference in `OLLAMA_MODEL`:

```bash
ollama pull llama3.2
```

If you use another tag (e.g. `llama3.2:3b`), set `OLLAMA_MODEL` to that exact name from `ollama list`.

## 4. Run Ollama

Ensure the Ollama daemon is running (the app expects the HTTP API on `OLLAMA_URL`, default `http://127.0.0.1:11434`).

```bash
ollama serve
```

(On many installs this already runs as a background service.)

## 5. Run the stack

**Terminal A — API:**

```bash
cd server
npm run dev
```

**Terminal B — Frontend:**

```bash
npm run dev
```

Or **one command** from the repo root (after root `npm install`):

```bash
npm run dev:all
```

- Frontend: **http://localhost:8080** (see `vite.config.ts` if the port differs)
- API: **http://localhost:3001**

The Vite dev server **proxies `/api`** to the API, so the browser calls `/api/...` without CORS issues.

## 6. Using the Meetings tab

1. Open **Meetings**.
2. Confirm the green/amber **Backend** banner shows database **connected** and Ollama **reachable**.
3. Enter a **Meeting title**, click **Start capture**.
4. Allow **camera** and **microphone** when prompted (one stream for preview, recording, and speech).
5. Speak normally; **Transcript** fills via Chrome speech recognition (typically your voice; others in the room only if the mic picks them up).
6. **Help — what should I say?** sends the recent transcript to Ollama for a reply suggestion.
7. **Calm down & suggest reply** (or **Demo: stress trigger**) uses the same endpoint with a calmer system prompt; live **stress** from the camera can trigger Calm automatically when transcript exists.
8. **End & save** stops capture, asks Ollama for a **summary + decisions + tasks**, saves a row in Postgres, and **downloads** the WebM recording (camera + mic).

## 7. Adding a real-time mood / stress trigger (optional)

The UI reserves **your camera** preview and documents where to hook in:

- When your model detects stress, invoke the same logic as **Calm down & suggest reply** (HTTP `POST /api/ai/help` with `calmMode: true` and the latest transcript snippet).
- You can run inference on `canvas` frames from the `<video>` element or use a small worker; keep the hook in one place so **Help**, **Calm**, and **mood** stay consistent.

## 8. Troubleshooting

| Issue | What to check |
|--------|----------------|
| Backend banner shows DB disconnected | `DATABASE_URL`, Postgres running, `init.sql` applied |
| Ollama unreachable | `ollama serve`, firewall, `OLLAMA_URL` |
| Empty transcript | Use Chrome; allow mic; some browsers lack `webkitSpeechRecognition` |
| Transcript drops or stutters | Close other heavy tabs; Chrome restarts speech after pauses — keep speaking or check CPU load from other apps |
| Model errors | `ollama list`, match `OLLAMA_MODEL` exactly |

## 9. Production notes (out of scope for hackathon)

- Run `npm run build` for the frontend and serve `dist/` behind any static host.
- Run the API with `NODE_ENV=production`, a process manager, and secure Postgres credentials.
- Do not expose Ollama to the public internet without authentication and network controls.
