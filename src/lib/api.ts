export type MeetingRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  transcript: string;
  summary: string;
  decisions: unknown;
  action_items: unknown;
  created_at: string;
};

export async function apiHealth(): Promise<{
  ok: boolean;
  database?: string;
  ollama?: string;
  model?: string;
  databaseError?: string;
}> {
  const r = await fetch("/api/health");
  return r.json();
}

export async function postHelp(transcript: string, calmMode = false): Promise<{ suggestion: string }> {
  const r = await fetch("/api/ai/help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, calmMode }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || r.statusText);
  }
  return r.json();
}

export async function postSummarize(
  transcript: string,
  title: string
): Promise<{ summary: string; decisions: string[]; actionItems: string[] }> {
  const r = await fetch("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, title }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || r.statusText);
  }
  return r.json();
}

export async function getMeetings(): Promise<MeetingRow[]> {
  const r = await fetch("/api/meetings");
  if (!r.ok) throw new Error("Failed to load meetings");
  return r.json();
}

export async function saveMeeting(body: {
  title: string;
  startedAt: string;
  endedAt: string;
  transcript: string;
  summary: string;
  decisions: string[];
  actionItems: string[];
}): Promise<MeetingRow> {
  const r = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: body.title,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
      transcript: body.transcript,
      summary: body.summary,
      decisions: body.decisions,
      actionItems: body.actionItems,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || r.statusText);
  }
  return r.json();
}
