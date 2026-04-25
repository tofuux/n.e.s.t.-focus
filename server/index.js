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

function httpErrorMessage(e) {
  return e instanceof Error ? e.message : String(e ?? "Unknown error");
}

async function ensureDb() {
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not set" };
  }
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: httpErrorMessage(e) };
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
  const textBody = await res.text();
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${textBody.slice(0, 2000)}`);
  }
  let data;
  try {
    data = JSON.parse(textBody);
  } catch {
    throw new Error(`Ollama returned non-JSON: ${textBody.slice(0, 500)}`);
  }
  const raw = data?.message?.content;
  if (typeof raw === "string") return raw.trim();
  if (raw == null || raw === "") return "";
  return String(raw).trim();
}

function stripMarkdownCodeFence(text) {
  let t = String(text).trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Parse first `{ ... }` using brace depth so strings / nested arrays don't break lastIndexOf("}"). */
function tryParseBalancedJson(text) {
  const s = String(text);
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function unescapeJsonStringContent(inner) {
  return inner.replace(/\\(.)/g, (_, c) => {
    if (c === "n") return "\n";
    if (c === "r") return "\r";
    if (c === "t") return "\t";
    if (c === '"') return '"';
    if (c === "\\") return "\\";
    return c;
  });
}

/** When the model returns truncated or noisy JSON, still pull a readable summary. */
function extractSummaryStringFallback(raw) {
  const s = String(raw);
  const m = s.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) return unescapeJsonStringContent(m[1]);
  const m2 = s.match(/"summary"\s*:\s*'([^']*)'/);
  if (m2) return m2[1];
  return null;
}

function extractStringArrayField(raw, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = String(raw).match(re);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return [];
  try {
    const parsed = JSON.parse(`[${inner}]`);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    const items = [];
    const strRe = /"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = strRe.exec(inner)) !== null) items.push(sm[1].replace(/\\"/g, '"'));
    return items.length ? items : [];
  }
}

function normalizeMeetingPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary
      : typeof parsed.Summary === "string"
        ? parsed.Summary
        : null;
  const decisionsRaw = parsed.decisions ?? parsed.Decisions;
  const actionsRaw = parsed.actionItems ?? parsed.action_items ?? parsed.ActionItems ?? parsed.tasks;
  const decisions = Array.isArray(decisionsRaw) ? decisionsRaw.map(String) : [];
  const actionItems = Array.isArray(actionsRaw) ? actionsRaw.map(String) : [];
  if (summary != null) return { summary, decisions, actionItems };
  return null;
}

function parseMeetingSummaryResponse(raw) {
  const cleaned = stripMarkdownCodeFence(raw);
  if (!/^\s*\{/.test(cleaned) && cleaned.length > 0) {
    return { summary: cleaned.slice(0, 4000), decisions: [], actionItems: [] };
  }

  const parsed =
    tryParseBalancedJson(cleaned) ||
    (() => {
      try {
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    })();

  const norm = normalizeMeetingPayload(parsed);
  if (norm) return norm;

  const summaryFromRegex = extractSummaryStringFallback(cleaned);
  if (summaryFromRegex) {
    const decisions = extractStringArrayField(cleaned, "decisions") ?? [];
    const actionItems =
      extractStringArrayField(cleaned, "actionItems") ?? extractStringArrayField(cleaned, "action_items") ?? [];
    return { summary: summaryFromRegex, decisions, actionItems };
  }

  return {
    summary:
      "The model response could not be parsed as structured JSON. Try ending the session again or use a smaller transcript.",
    decisions: [],
    actionItems: [],
  };
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

const DOCUMENT_PREPARE_IN_MAX = 120_000;
const DOCUMENT_PREPARE_OUT_MAX = 7500;
const HELP_DOC_CONTEXT_MAX = 12_000;

app.post("/api/ai/prepare-document", async (req, res) => {
  const raw = String(req.body?.text || "").slice(0, DOCUMENT_PREPARE_IN_MAX);
  const fileName = String(req.body?.fileName || "document").slice(0, 240);
  if (!raw.trim()) {
    return res.status(400).json({ error: "text is empty" });
  }
  try {
    const system =
      "You create dense REFERENCE NOTES for a live meeting copilot. The copilot will not see the full document again—only your notes plus a live speech transcript. Capture what the user might ask about: topic, key facts, figures, dates, names, obligations, definitions, section or clause references, important lists. Format as plain text: one short title line, then bullet points. No fluff, no repetition, no preamble or closing. Prefer brevity; stay under 3500 words and much shorter when the source is simple.";
    const user = `File name: ${fileName}\n\nDocument text (may be partial):\n---\n${raw}\n---\n\nOutput the notes only.`;
    const context = await ollamaChat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const trimmed = String(context || "").trim().slice(0, DOCUMENT_PREPARE_OUT_MAX);
    if (!trimmed) {
      return res.status(502).json({ error: "Model returned empty notes" });
    }
    res.json({ context: trimmed });
  } catch (e) {
    res.status(502).json({ error: httpErrorMessage(e) || "Ollama request failed" });
  }
});

app.post("/api/ai/help", async (req, res) => {
  const transcript = String(req.body?.transcript || "").slice(-12000);
  const calmMode = Boolean(req.body?.calmMode);
  const documentContext = String(req.body?.documentContext || "").slice(0, HELP_DOC_CONTEXT_MAX);
  const documentName = String(req.body?.documentName || "Reference document").slice(0, 240);
  const hasDoc = documentContext.trim().length > 0;

  if (!transcript.trim()) {
    return res.status(400).json({ error: "transcript is empty — wait for speech or type context." });
  }
  try {
    const system = calmMode
      ? hasDoc
        ? "You are a supportive meeting coach. The user may feel stressed. They prepared brief notes from a reference PDF before the meeting (below). Give a short calming note (1-2 sentences), then suggest one concise reply they can say next (one sentence in quotes). When the transcript asks about the document, ground your reply in those notes; otherwise keep it general. Use plain language."
        : "You are a supportive meeting coach. The user may feel stressed. Give a short calming note (1-2 sentences), then suggest one concise reply they can say next (one sentence in quotes). Use plain language."
      : hasDoc
        ? "You are a concise meeting copilot. The user has pre-summarized notes from a reference PDF (below) and a live meeting transcript. When they ask about the document, answer from those notes. For general meeting flow, suggest what they could say next: one clear sentence they can speak aloud, plus a brief reason (one line). If something is unclear, ask one clarifying question they could use."
        : "You are a concise meeting copilot. From the recent transcript, suggest what the user could say next: one clear sentence they can speak aloud, plus a brief reason (one line). If unclear, ask one clarifying question they could use.";

    let userContent = "";
    if (hasDoc) {
      userContent += `Reference document "${documentName}" (prepared notes; not the full PDF):\n---\n${documentContext}\n---\n\n`;
    }
    userContent += `Recent meeting transcript (may be partial):\n---\n${transcript}\n---\n\n`;
    userContent += calmMode
      ? "Help the user with what to say next, using the transcript and the reference document when relevant."
      : "What should I say or answer next? Use the document when the user asks about it or when the discussion clearly relates to it.";

    const content = await ollamaChat([
      { role: "system", content: system },
      { role: "user", content: userContent },
    ]);
    res.json({ suggestion: content });
  } catch (e) {
    res.status(502).json({ error: httpErrorMessage(e) || "Ollama request failed" });
  }
});

app.post("/api/ai/summarize", async (req, res) => {
  const transcript = String(req.body?.transcript || "").slice(-200000);
  const title = String(req.body?.title || "Meeting").slice(0, 200);
  if (!transcript.trim()) {
    return res.status(400).json({ error: "transcript is empty" });
  }
  try {
    const prompt = `You summarize a meeting for one attendee. Reply with ONE JSON object only (no markdown fences, no commentary before or after).
Use exactly these keys: summary (string, 2-4 sentences), decisions (JSON array of strings), actionItems (JSON array of strings).
Escape any double quotes inside summary as \\".
Example: {"summary":"...","decisions":[],"actionItems":[]}
Transcript:\n---\n${transcript}\n---`;

    const raw = await ollamaChat([
      {
        role: "system",
        content:
          "Output only a single valid JSON object. Keys: summary (string), decisions (array of strings), actionItems (array of strings). No markdown, no trailing commas, complete closing braces.",
      },
      { role: "user", content: prompt },
    ]);

    const { summary, decisions, actionItems } = parseMeetingSummaryResponse(raw);

    res.json({ summary, decisions, actionItems });
  } catch (e) {
    res.status(502).json({ error: httpErrorMessage(e) || "Ollama request failed" });
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
    res.status(500).json({ error: httpErrorMessage(e) });
  }
});

app.get("/api/meetings/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  try {
    const { rows } = await pool.query(`SELECT * FROM meetings WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: httpErrorMessage(e) });
  }
});

app.delete("/api/meetings/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  try {
    const { rowCount } = await pool.query(`DELETE FROM meetings WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: httpErrorMessage(e) });
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
    res.status(500).json({ error: httpErrorMessage(e) });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
