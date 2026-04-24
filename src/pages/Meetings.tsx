import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle,
  Download,
  Headphones,
  HelpCircle,
  Loader2,
  Mic,
  MicOff,
  MonitorPlay,
  Sparkles,
  Video,
  Zap,
  FileText,
  HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import { useVideoStressMonitor } from "@/hooks/useVideoStressMonitor";
import {
  apiHealth,
  getMeetings,
  postHelp,
  postSummarize,
  saveMeeting,
  type MeetingRow,
} from "@/lib/api";
import { toast } from "sonner";

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

export default function Meetings() {
  const queryClient = useQueryClient();
  const screenRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);

  const [meetingTitle, setMeetingTitle] = useState("Meeting");
  const [startedAtIso, setStartedAtIso] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof apiHealth>> | null>(null);
  const [helpText, setHelpText] = useState<string | null>(null);
  const [calmPrompt, setCalmPrompt] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const helpLoadingRef = useRef(false);
  helpLoadingRef.current = helpLoading;

  const session = useMeetingSession();

  const backendOk = health?.database === "connected" && health?.ollama === "reachable";

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
      const { displayStream, micStream } = await session.startSession();
      if (screenRef.current) {
        screenRef.current.srcObject = displayStream;
        await screenRef.current.play().catch(() => undefined);
      }
      if (cameraRef.current) {
        cameraRef.current.srcObject = micStream;
        await cameraRef.current.play().catch(() => undefined);
      }
      setStartedAtIso(new Date().toISOString());
      setHelpText(null);
      setCalmPrompt(null);
      toast.success("Capture started — pick Meet tab + enable tab audio if prompted.");
    } catch {
      /* startSession sets lastError */
    }
  }, [session]);

  const detachVideos = useCallback(() => {
    if (screenRef.current) screenRef.current.srcObject = null;
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
        const { suggestion } = await postHelp(snippet, calmMode);
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
    [session]
  );

  const runHelpRef = useRef(runHelp);
  runHelpRef.current = runHelp;

  const stressMonitor = useVideoStressMonitor({
    videoRef: cameraRef,
    enabled: session.isSessionActive && backendOk,
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
          toast.error(e instanceof Error ? e.message : "Summary failed — meeting still saved.");
          summary = "Summary could not be generated. See transcript in database.";
        }
      } else {
        summary = "No transcript captured (speech recognition may be unavailable or silent).";
      }

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
    } finally {
      setEnding(false);
      setStartedAtIso(null);
    }
  }, [session, detachVideos, startedAtIso, meetingTitle, saveMutation]);

  const meetings: MeetingRow[] = meetingsQuery.data ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Meeting Copilot</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Capture Meet tab video + system audio, your camera/mic, live transcript, AI help via Ollama, and saved summaries in Postgres.
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 nest-shadow-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-primary" />
              Live capture
            </CardTitle>
            <CardDescription>
              Start → choose the Google Meet <strong>Chrome tab</strong> and enable <strong>Share tab audio</strong>. Your camera preview runs a local mood estimate (face expressions → stress score, smoothed). When stress stays above the threshold, <strong>Calm down &amp; suggest reply</strong> runs automatically if there is transcript.
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
                    End &amp; save
                  </Button>
                )}
              </div>
            </div>

            {session.lastError && (
              <p className="text-sm text-destructive">{session.lastError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl overflow-hidden bg-muted aspect-video border border-border/50 relative">
                <video ref={screenRef} className="w-full h-full object-contain bg-black" playsInline muted />
                <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded-md">
                  Screen / Meet
                </span>
              </div>
              <div className="rounded-xl overflow-hidden bg-muted aspect-video border border-border/50 relative">
                <video ref={cameraRef} className="w-full h-full object-cover bg-black" playsInline muted />
                <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Video className="h-3 w-3" /> You
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
                  Listening — transcript builds locally (Chrome speech), recording includes tab + mic audio.
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
                disabled={!session.isSessionActive || helpLoading || !backendOk}
                onClick={() => void runHelp(false)}
              >
                {helpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HelpCircle className="h-4 w-4" />}
                Help — what should I say?
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-nest-rose/50 text-nest-rose-foreground"
                disabled={!session.isSessionActive || helpLoading || !backendOk}
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
                disabled={!session.isSessionActive || helpLoading || !backendOk}
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
                <strong>Recording</strong> mixes Meet tab audio with your microphone via a small in-browser audio graph.
              </p>
              <p>
                <strong>Transcript</strong> uses the Web Speech API in Chrome (sends audio to Google&apos;s speech service). For a fully local pipeline, swap in Whisper later.
              </p>
              <p>
                <strong>End &amp; save</strong> calls Ollama for a structured summary, then stores everything in Postgres. The WebM file downloads automatically.
              </p>
              <p className="flex items-center gap-1 text-nest-mint-foreground">
                <Download className="h-3 w-3 shrink-0" />
                Download is the raw recording; DB holds transcript + AI summary.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h3 className="font-heading font-semibold text-foreground mb-4">Saved meetings</h3>
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
