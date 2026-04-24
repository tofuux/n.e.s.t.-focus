import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;

const PORT = Number(process.env.PORT) || 3001;
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

async function ensureDb() {
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not set" };
  }
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function ollamaChat(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama error ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.message?.content?.trim() || "";
}

function tryParseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

app.get("/api/health", async (_req, res) => {
  const db = await ensureDb();
  let ollama = false;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    ollama = r.ok;
  } catch {
    ollama = false;
  }
  res.json({
    ok: db.ok && ollama,
    database: db.ok ? "connected" : "disconnected",
    databaseError: db.ok ? undefined : db.error,
    ollama: ollama ? "reachable" : "unreachable",
    model: OLLAMA_MODEL,
  });
});

app.post("/api/ai/help", async (req, res) => {
  const transcript = String(req.body?.transcript || "").slice(-12000);
  const calmMode = Boolean(req.body?.calmMode);
  if (!transcript.trim()) {
    return res.status(400).json({ error: "transcript is empty — wait for speech or type context." });
  }
  try {
    const system = calmMode
      ? "You are a supportive meeting coach. The user may feel stressed. Give a short calming note (1-2 sentences), then suggest one concise reply they can say next (one sentence in quotes). Use plain language."
      : "You are a concise meeting copilot. From the recent transcript, suggest what the user could say next: one clear sentence they can speak aloud, plus a brief reason (one line). If unclear, ask one clarifying question they could use.";

    const content = await ollamaChat([
      { role: "system", content: system },
      {
        role: "user",
        content: `Recent meeting transcript (may be partial):\n---\n${transcript}\n---\nWhat should I say next?`,
      },
    ]);
    res.json({ suggestion: content });
  } catch (e) {
    res.status(502).json({ error: e.message || "Ollama request failed" });
  }
});

app.post("/api/ai/summarize", async (req, res) => {
  const transcript = String(req.body?.transcript || "").slice(-200000);
  const title = String(req.body?.title || "Meeting").slice(0, 200);
  if (!transcript.trim()) {
    return res.status(400).json({ error: "transcript is empty" });
  }
  try {
    const prompt = `You summarize a meeting for one attendee. Return ONLY valid JSON with this shape (no markdown):
{"summary":"2-4 sentences","decisions":["..."],"actionItems":["..."]}
Transcript:\n---\n${transcript}\n---`;

    const raw = await ollamaChat([
      {
        role: "system",
        content:
          "You output only compact JSON. Keys: summary (string), decisions (array of strings), actionItems (array of strings). No extra keys.",
      },
      { role: "user", content: prompt },
    ]);

    const parsed = tryParseJsonObject(raw);
    const summary = typeof parsed?.summary === "string" ? parsed.summary : raw.slice(0, 2000);
    const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions.map(String) : [];
    const actionItems = Array.isArray(parsed?.actionItems) ? parsed.actionItems.map(String) : [];

    res.json({ summary, decisions, actionItems });
  } catch (e) {
    res.status(502).json({ error: e.message || "Ollama request failed" });
  }
});

app.get("/api/meetings", async (_req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT id, title, started_at, ended_at, transcript, summary, decisions, action_items, created_at
       FROM meetings ORDER BY started_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/meetings/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  try {
    const { rows } = await pool.query(`SELECT * FROM meetings WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/meetings/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  try {
    const { rowCount } = await pool.query(`DELETE FROM meetings WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/meetings", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  const title = String(req.body?.title || "Meeting").slice(0, 200);
  const startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : new Date();
  const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : new Date();
  const transcript = String(req.body?.transcript || "");
  const summary = String(req.body?.summary || "");
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const actionItems = Array.isArray(req.body?.actionItems) ? req.body.actionItems : [];

  try {
    const { rows } = await pool.query(
      `INSERT INTO meetings (title, started_at, ended_at, transcript, summary, decisions, action_items)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id, title, started_at, ended_at, transcript, summary, decisions, action_items, created_at`,
      [title, startedAt, endedAt, transcript, summary, JSON.stringify(decisions), JSON.stringify(actionItems)]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
