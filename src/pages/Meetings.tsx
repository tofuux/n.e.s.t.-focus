import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check,
  CheckCircle,
  Copy,
  Download,
  EyeOff,
  Headphones,
  HelpCircle,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Video,
  Zap,
  FileText,
  HeartPulse,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import { useVideoStressMonitor } from "@/hooks/useVideoStressMonitor";
import {
  apiHealth,
  getMeetings,
  postHelp,
  postPrepareDocument,
  postSummarize,
  saveMeeting,
  type MeetingRow,
} from "@/lib/api";
import { extractPdfTextFromFile } from "@/lib/extractPdfText";
import { toast } from "sonner";

const HELP_DOCUMENT_SEND_MAX = 12_000;

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

type IncognitoOutcome = {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: string[];
};

function formatIncognitoCopy(o: IncognitoOutcome): string {
  const lines = [
    o.title,
    "",
    "Summary",
    o.summary,
    "",
    "Decisions",
    ...o.decisions.map((d) => `• ${d}`),
    "",
    "Tasks",
    ...o.actionItems.map((t) => `• ${t}`),
  ];
  return lines.join("\n");
}

export default function Meetings() {
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLVideoElement>(null);

  const [meetingTitle, setMeetingTitle] = useState("Meeting");
  const [startedAtIso, setStartedAtIso] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof apiHealth>> | null>(null);
  const [helpText, setHelpText] = useState<string | null>(null);
  const [calmPrompt, setCalmPrompt] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [incognitoMode, setIncognitoMode] = useState(false);
  const [incognitoOutcome, setIncognitoOutcome] = useState<IncognitoOutcome | null>(null);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);
  /** Dense notes from one-time Ollama pass (not raw PDF). */
  const [documentBrief, setDocumentBrief] = useState("");
  const [documentFileName, setDocumentFileName] = useState<string | null>(null);
  const [documentPrepareBusy, setDocumentPrepareBusy] = useState(false);
  const [documentPrepareLabel, setDocumentPrepareLabel] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const helpLoadingRef = useRef(false);
  helpLoadingRef.current = helpLoading;

  const session = useMeetingSession();

  useEffect(() => {
    if (!incognitoMode) return;
    setDocumentBrief("");
    setDocumentFileName(null);
  }, [incognitoMode]);

  const dbOk = health?.database === "connected";
  const ollamaOk = health?.ollama === "reachable";
  const backendOk = dbOk && ollamaOk;

  const meetingsQuery = useQuery({
    queryKey: ["meetings"],
    queryFn: getMeetings,
  });

  useEffect(() => {
    apiHealth().then(setHealth).catch(() =>
      setHealth({ ok: false, database: "unknown", ollama: "unknown" })
    );
  }, []);

  const attachStreams = useCallback(async () => {
    try {
      setIncognitoOutcome(null);
      const { mediaStream } = await session.startSession({ recordMeeting: !incognitoMode });
      if (cameraRef.current) {
        cameraRef.current.srcObject = mediaStream;
        await cameraRef.current.play().catch(() => undefined);
      }
      setStartedAtIso(new Date().toISOString());
      setHelpText(null);
      setCalmPrompt(null);
      if (incognitoMode) {
        toast.success("Incognito capture started — nothing will be saved to the database.");
      } else {
        toast.success("Capture started — camera, mic, and transcript (Chrome).");
      }
    } catch {
      /* startSession sets lastError */
    }
  }, [session, incognitoMode]);

  const detachVideos = useCallback(() => {
    if (cameraRef.current) cameraRef.current.srcObject = null;
  }, []);

  const runHelp = useCallback(
    async (calmMode: boolean) => {
      const snippet = session.getSnippetForAi();
      if (!snippet.trim()) {
        toast.message("No transcript yet", {
          description: "Wait for speech (or ensure Chrome speech is allowed), then try again.",
        });
        return;
      }
      setHelpLoading(true);
      setCalmPrompt(null);
      try {
        const docText = !incognitoMode && documentBrief.trim() ? documentBrief.slice(0, HELP_DOCUMENT_SEND_MAX) : "";
        const { suggestion } = await postHelp(snippet, calmMode, {
          documentContext: docText || undefined,
          documentName: documentFileName ?? undefined,
        });
        setHelpText(suggestion);
        if (calmMode) {
          setCalmPrompt("Take a breath — here is a gentle reply you can use.");
          toast.message("Calm coaching ready");
        } else {
          toast.success("Suggestion ready");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Help request failed");
      } finally {
        setHelpLoading(false);
      }
    },
    [session, incognitoMode, documentBrief, documentFileName]
  );

  const onPdfSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (session.isSessionActive) {
        toast.message("Upload before starting capture", {
          description: "Document context is prepared once before the meeting. End the session to change the PDF.",
        });
        return;
      }
      if (!ollamaOk) {
        toast.error("Ollama must be reachable to summarize the document.");
        return;
      }
      const maxBytes = 40 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error("PDF is too large (max 40 MB).");
        return;
      }
      setDocumentPrepareBusy(true);
      setDocumentPrepareLabel("Reading PDF…");
      try {
        const text = await extractPdfTextFromFile(file);
        if (!text.trim()) {
          toast.error("No text found in this PDF — it may be image-only. Try a text-based PDF.");
          return;
        }
        setDocumentPrepareLabel("Summarizing...");
        const { context } = await postPrepareDocument(text, file.name);
        if (!context.trim()) {
          toast.error("Could not build document notes — try again.");
          return;
        }
        setDocumentBrief(context);
        setDocumentFileName(file.name);
        toast.success("Document ready — Help / Calm will use the summary only (faster).");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not prepare document");
      } finally {
        setDocumentPrepareBusy(false);
        setDocumentPrepareLabel("");
      }
    },
    [session.isSessionActive, ollamaOk]
  );

  const clearReferencePdf = useCallback(() => {
    if (session.isSessionActive) return;
    setDocumentBrief("");
    setDocumentFileName(null);
  }, [session.isSessionActive]);

  const runHelpRef = useRef(runHelp);
  runHelpRef.current = runHelp;

  const stressMonitor = useVideoStressMonitor({
    videoRef: cameraRef,
    enabled: session.isSessionActive && ollamaOk,
    onHighStress: () => {
      if (helpLoadingRef.current) return;
      const snippet = session.getSnippetForAi();
      if (!snippet.trim()) return;
      void runHelpRef.current(true);
    },
  });

  const saveMutation = useMutation({
    mutationFn: saveMeeting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const endSession = useCallback(async () => {
    setEnding(true);
    setHelpText(null);
    setCalmPrompt(null);
    try {
      const { blob, transcript } = await session.stopSession();
      detachVideos();

      const endedAt = new Date().toISOString();
      const startedAt = startedAtIso || endedAt;

      let summary = "";
      let decisions: string[] = [];
      let actionItems: string[] = [];

      if (transcript.trim()) {
        try {
          const s = await postSummarize(transcript, meetingTitle);
          summary = s.summary;
          decisions = s.decisions;
          actionItems = s.actionItems;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Summary failed.";
          toast.error(incognitoMode ? msg : `${msg} Meeting may be saved without a good summary.`);
          summary = incognitoMode
            ? "Summary could not be generated. Nothing was stored."
            : "Summary could not be generated. See transcript in database.";
        }
      } else {
        summary = "No transcript captured (speech recognition may be unavailable or silent).";
      }

      if (incognitoMode) {
        setIncognitoOutcome({
          title: meetingTitle,
          summary,
          decisions,
          actionItems,
        });
        toast.message("Incognito session ended", {
          description: "Summary is on screen only — copy it now. No database row or recording file was kept.",
        });
      } else {
        try {
          await saveMutation.mutateAsync({
            title: meetingTitle,
            startedAt,
            endedAt,
            transcript,
            summary,
            decisions,
            actionItems,
          });
          toast.success("Meeting saved");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not save to database");
        }

        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${meetingTitle.replace(/\s+/g, "-")}-recording.webm`;
          a.click();
          URL.revokeObjectURL(url);
          toast.message("Recording download started");
        }
      }
    } finally {
      setEnding(false);
      setStartedAtIso(null);
    }
  }, [session, detachVideos, startedAtIso, meetingTitle, saveMutation, incognitoMode]);

  const copyToClipboard = useCallback(async (label: string, text: string, hintId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHint(hintId);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopiedHint((h) => (h === hintId ? null : h)), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, []);

  const meetings: MeetingRow[] = meetingsQuery.data ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Meeting Copilot</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Camera and microphone only (no screen share) for a lighter session: live transcript and AI help via Ollama. <strong>Normal</strong> mode saves summaries and a WebM of your camera+mic;{" "}
          <strong>Incognito</strong> keeps nothing in the database — you only get an on-screen summary to copy.
        </p>
      </div>

      {health && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            backendOk ? "bg-nest-mint/30 border-nest-mint text-nest-mint-foreground" : "bg-nest-warm/30 border-nest-warm text-nest-warm-foreground"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">Backend: {backendOk ? "Ready" : "Check setup"}</span>
            <span>Database: {health.database}</span>
            <span>Ollama: {health.ollama}</span>
            {health.model && <span>Model: {health.model}</span>}
          </div>
          {!backendOk && health.databaseError && (
            <p className="text-xs mt-1 opacity-90">{health.databaseError}</p>
          )}
          {incognitoMode && ollamaOk && !dbOk && (
            <p className="text-xs mt-2 opacity-90">
              Incognito selected: Ollama is enough — the database can stay offline. Nothing from this session will be written to Postgres.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 nest-shadow-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Live capture
            </CardTitle>
            <CardDescription>
              Start → allow <strong>camera and microphone</strong>. Transcript uses Chrome&apos;s Web Speech API (your voice; use speakers or a meeting bridge if others should appear in text). The preview runs a local mood estimate (face expressions → stress score). When stress stays high, <strong>Calm down &amp; suggest reply</strong> can run automatically if there is transcript.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="meet-title">Meeting title</Label>
                <Input
                  id="meet-title"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  disabled={session.isSessionActive}
                  placeholder="e.g. Sprint planning"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!session.isSessionActive ? (
                  <Button className="nest-gradient-primary text-primary-foreground gap-2" onClick={() => void attachStreams()}>
                    <Mic className="h-4 w-4" />
                    Start capture
                  </Button>
                ) : (
                  <Button variant="destructive" className="gap-2" disabled={ending} onClick={() => void endSession()}>
                    {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicOff className="h-4 w-4" />}
                    {incognitoMode ? "End session" : "End & save"}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/35 px-3 py-3">
              <div className="space-y-1 pr-2">
                <Label htmlFor="incognito-mode" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  Incognito mode
                </Label>
                <p id="incognito-mode-desc" className="text-xs text-muted-foreground leading-relaxed">
                  No Postgres save, no WebM download, and the in-app transcript clears when you end. Afterward you only see summary, decisions, and tasks here — copy them if needed. Live AI help still sends recent text to your API/Ollama (not stored by this app).
                </p>
              </div>
              <Switch
                id="incognito-mode"
                checked={incognitoMode}
                onCheckedChange={setIncognitoMode}
                disabled={session.isSessionActive}
                aria-describedby="incognito-mode-desc"
                className="shrink-0"
              />
            </div>

            {!incognitoMode && (
              <div className="rounded-lg border border-border/60 bg-muted/35 px-3 py-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1 pr-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Reference PDF (optional)
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <strong>Before</strong> you start capture: upload a PDF. Text is read in your browser, then Ollama builds a <strong>short summary once</strong>. During the meeting, only that summary is sent with each Help / Calm request (not the full file). Change or remove the PDF only while capture is stopped. Image-only PDFs may not yield text.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={session.isSessionActive || documentPrepareBusy}
                      onChange={(ev) => void onPdfSelected(ev)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      disabled={session.isSessionActive || documentPrepareBusy || !ollamaOk}
                      onClick={() => pdfInputRef.current?.click()}
                      aria-label="Upload a PDF to summarize once before the meeting"
                    >
                      {documentPrepareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {documentPrepareBusy ? documentPrepareLabel || "Working…" : "Upload PDF"}
                    </Button>
                    {documentFileName && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={session.isSessionActive || documentPrepareBusy}
                        onClick={clearReferencePdf}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                {!ollamaOk && health && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">Ollama must be reachable to prepare a document.</p>
                )}
                {documentFileName && (
                  <p className="text-xs text-muted-foreground">
                    Prepared: <span className="font-medium text-foreground">{documentFileName}</span>
                    {" · "}
                    {Math.min(documentBrief.length, HELP_DOCUMENT_SEND_MAX).toLocaleString()} characters of notes per Help request
                    {documentBrief.length > HELP_DOCUMENT_SEND_MAX ? " (capped)" : ""}
                  </p>
                )}
              </div>
            )}

            {session.lastError && (
              <p className="text-sm text-destructive">{session.lastError}</p>
            )}

            <div className="max-w-2xl mx-auto w-full">
              <div className="rounded-xl overflow-hidden bg-muted aspect-video border border-border/50 relative">
                <video ref={cameraRef} className="w-full h-full object-cover bg-black" playsInline muted />
                <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Video className="h-3 w-3" /> Camera + mic
                </span>
                {session.isSessionActive && (
                  <div className="absolute top-2 right-2 max-w-[min(100%,14rem)] text-right space-y-1">
                    {stressMonitor.loadError ? (
                      <span className="inline-block text-[10px] leading-tight text-amber-200 bg-black/65 px-2 py-1 rounded-md">
                        Mood models failed to load (offline?). Calm auto-trigger disabled.
                      </span>
                    ) : !stressMonitor.modelsReady ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/90 bg-black/65 px-2 py-1 rounded-md">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        Loading mood models…
                      </span>
                    ) : stressMonitor.avgStress != null ? (
                      <span
                        className={`inline-block text-[10px] font-semibold tabular-nums px-2 py-1 rounded-md bg-black/70 ${
                          stressMonitor.isHighStress ? "text-red-300" : "text-emerald-300"
                        }`}
                      >
                        Stress (est.): {stressMonitor.avgStress.toFixed(2)}
                        {stressMonitor.isHighStress ? " · High" : ""}
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] text-white/85 bg-black/65 px-2 py-1 rounded-md">
                        Face the camera for a reading…
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session.isSessionActive && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-focus-pulse" />
                  <Headphones className="h-4 w-4" />
                  Listening — transcript builds locally (Chrome speech).
                  {incognitoMode ? " Incognito: no recording file." : " Recording is camera + microphone only."}
                </div>
              )}
              {!session.speechSupported && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Speech recognition not available in this browser — use Chrome for live transcript, or rely on recording + manual notes.
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcript</span>
                {session.interim && (
                  <span className="text-xs text-muted-foreground truncate max-w-[60%]">{session.interim}</span>
                )}
              </div>
              <ScrollArea className="h-36 rounded-lg border border-border/40 bg-background/80 p-3 text-sm">
                {session.transcript ? (
                  <p className="whitespace-pre-wrap text-foreground/90">{session.transcript}</p>
                ) : (
                  <p className="text-muted-foreground">Transcript appears as you speak…</p>
                )}
              </ScrollArea>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                disabled={!session.isSessionActive || helpLoading || !ollamaOk}
                onClick={() => void runHelp(false)}
              >
                {helpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HelpCircle className="h-4 w-4" />}
                Help — what should I say?
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-nest-rose/50 text-nest-rose-foreground"
                disabled={!session.isSessionActive || helpLoading || !ollamaOk}
                onClick={() => void runHelp(true)}
              >
                <HeartPulse className="h-4 w-4" />
                Calm down &amp; suggest reply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                disabled={!session.isSessionActive || helpLoading || !ollamaOk}
                onClick={() => void runHelp(true)}
                title="Manual test — same as Calm down & suggest reply. Live camera stress also triggers this when the smoothed score stays high."
              >
                Demo: stress trigger
              </Button>
            </div>

            {(helpText || calmPrompt) && (
              <div className="rounded-xl bg-accent/50 border border-border/30 p-4 space-y-2 animate-fade-in-up">
                {calmPrompt && (
                  <p className="text-sm font-medium text-nest-rose-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {calmPrompt}
                  </p>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap">{helpText}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="nest-shadow-card border-border/60 h-fit">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              How it works
            </CardTitle>
            <CardDescription className="space-y-2 text-xs leading-relaxed">
              <p>
                <strong>Recording</strong> is a single WebM from your camera and microphone (no screen or tab capture).
              </p>
              <p>
                <strong>Transcript</strong> uses the Web Speech API in Chrome (sends audio to Google&apos;s speech service). For a fully local pipeline, swap in Whisper later.
              </p>
              <p>
                <strong>End &amp; save</strong> (normal mode) calls Ollama for a structured summary, then stores everything in Postgres. The WebM file downloads automatically.
              </p>
              <p>
                <strong>Incognito</strong> skips the database and recording file; after you end, copy the summary from the page — then dismiss to clear it from the UI.
              </p>
              <p>
                <strong>Reference PDF</strong> (normal mode): upload <strong>before</strong> capture; the app summarizes it once and reuses that brief for faster Help / Calm.
              </p>
              <p className="flex items-center gap-1 text-nest-mint-foreground">
                <Download className="h-3 w-3 shrink-0" />
                Normal mode: download is the raw recording; DB holds transcript + AI summary.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {incognitoOutcome && (
        <Card className="nest-shadow-card border-nest-purple/35 bg-card/80">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <EyeOff className="h-5 w-5 text-nest-purple" />
                  Incognito summary
                </CardTitle>
                <CardDescription className="mt-1">
                  Not saved anywhere in this app. Copy what you need, then dismiss — this panel only lives in your browser tab.
                </CardDescription>
                <p className="text-sm font-medium text-foreground mt-2">{incognitoOutcome.title}</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void copyToClipboard("Summary bundle", formatIncognitoCopy(incognitoOutcome), "all")}
                >
                  {copiedHint === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setIncognitoOutcome(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Summary</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => void copyToClipboard("Summary", incognitoOutcome.summary, "summary")}
                >
                  {copiedHint === "summary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </Button>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{incognitoOutcome.summary}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Decisions</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      void copyToClipboard(
                        "Decisions",
                        incognitoOutcome.decisions.map((d) => `• ${d}`).join("\n") || "—",
                        "decisions"
                      )
                    }
                  >
                    {copiedHint === "decisions" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                {incognitoOutcome.decisions.length ? (
                  incognitoOutcome.decisions.map((d, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                      <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                      {d}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">None listed</p>
                )}
              </div>
              <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-nest-purple">Tasks</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      void copyToClipboard(
                        "Tasks",
                        incognitoOutcome.actionItems.map((t) => `• ${t}`).join("\n") || "—",
                        "tasks"
                      )
                    }
                  >
                    {copiedHint === "tasks" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                {incognitoOutcome.actionItems.length ? (
                  incognitoOutcome.actionItems.map((t, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                      <Zap className="h-3 w-3 text-nest-purple shrink-0" />
                      {t}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">None listed</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-heading font-semibold text-foreground mb-4">Saved meetings</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Only <strong>normal</strong> sessions appear here. Incognito summaries are never stored in the database.
        </p>
        {meetingsQuery.isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {meetingsQuery.isError && (
          <p className="text-sm text-destructive">Could not load meetings (is the API running and DATABASE_URL set?).</p>
        )}
        {!meetings.length && !meetingsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">No saved meetings yet. End a session to generate a summary.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {meetings.map((m) => {
            const decisions = asStringArray(m.decisions);
            const actions = asStringArray(m.action_items);
            const dateLabel = m.started_at ? format(new Date(m.started_at), "MMM d, yyyy · HH:mm") : "";
            return (
              <div key={m.id} className="rounded-2xl bg-card p-5 nest-shadow-card border border-border/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-heading font-semibold text-foreground">{m.title}</h4>
                    <span className="text-xs text-muted-foreground">{dateLabel}</span>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mb-3">{m.summary || "—"}</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Decisions</p>
                    {decisions.length ? (
                      decisions.map((d, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                          <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                          {d}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">None listed</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-nest-purple mt-2 mb-1">Tasks</p>
                    {actions.length ? (
                      actions.map((a, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                          <Zap className="h-3 w-3 text-nest-purple shrink-0" />
                          {a}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">None listed</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
