import { useState } from "react";
import { Mic, MicOff, MessageSquare, AlertCircle, CheckCircle, Zap, FileText } from "lucide-react";

const pastMeetings = [
  {
    title: "Sprint Retrospective",
    date: "Apr 21",
    summary: "Team discussed blockers and velocity improvements. Agreed on reducing WIP limits.",
    decisions: ["Reduce WIP to 3", "Add daily async standups"],
    actions: ["Create Jira board template", "Set up Slack reminders"],
  },
  {
    title: "Product Sync",
    date: "Apr 20",
    summary: "Reviewed roadmap priorities for Q2. Mobile app pushed to Q3.",
    decisions: ["Prioritize API v2", "Defer mobile"],
    actions: ["Update roadmap doc", "Notify stakeholders"],
  },
];

export default function Meetings() {
  const [isLive, setIsLive] = useState(false);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Meeting Copilot</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time AI assistant for better communication</p>
      </div>

      {/* Live Meeting Panel */}
      <div className="rounded-2xl bg-card p-6 nest-shadow-card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isLive ? "bg-green-500 animate-focus-pulse" : "bg-muted-foreground/30"}`} />
            <h3 className="font-heading font-semibold text-foreground">
              {isLive ? "Live: Sprint Planning" : "No Active Meeting"}
            </h3>
          </div>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              isLive
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "nest-gradient-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {isLive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isLive ? "End Session" : "Start Session"}
          </button>
        </div>

        {isLive && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up">
            {/* Speak/Wait Cue */}
            <div className="rounded-xl bg-nest-mint/30 border border-nest-mint p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-nest-mint-foreground" />
                <span className="text-xs font-semibold text-nest-mint-foreground uppercase tracking-wider">Cue</span>
              </div>
              <p className="text-lg font-heading font-bold text-nest-mint-foreground">Good time to speak</p>
              <p className="text-xs text-nest-mint-foreground/70 mt-1">Conversation has paused for 3s</p>
            </div>

            {/* Tone Analysis */}
            <div className="rounded-xl bg-nest-warm/30 border border-nest-warm p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-nest-warm-foreground" />
                <span className="text-xs font-semibold text-nest-warm-foreground uppercase tracking-wider">Tone</span>
              </div>
              <p className="text-sm font-medium text-nest-warm-foreground">Your last message may sound directive</p>
              <p className="text-xs text-nest-warm-foreground/70 mt-1">Try: "What do you think about…"</p>
            </div>

            {/* AI Simplifier */}
            <div className="rounded-xl bg-accent/50 border border-border/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-accent-foreground" />
                <span className="text-xs font-semibold text-accent-foreground uppercase tracking-wider">Simplify</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Original: "We need to synergize cross-functional deliverables"</p>
              <p className="text-sm font-medium text-foreground">→ "Let's align our teams on the key tasks"</p>
            </div>
          </div>
        )}

        {!isLive && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mic className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Start a session to get real-time AI assistance during meetings</p>
          </div>
        )}
      </div>

      {/* Past Meetings */}
      <div>
        <h3 className="font-heading font-semibold text-foreground mb-4">Recent Meetings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {pastMeetings.map((meeting, i) => (
            <div key={i} className="rounded-2xl bg-card p-5 nest-shadow-card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-heading font-semibold text-foreground">{meeting.title}</h4>
                  <span className="text-xs text-muted-foreground">{meeting.date}</span>
                </div>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-3">{meeting.summary}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">Decisions</p>
                  {meeting.decisions.map((d, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                      <CheckCircle className="h-3 w-3 text-primary" />
                      {d}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-nest-purple mt-2 mb-1">Action Items</p>
                  {meeting.actions.map((a, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-foreground">
                      <Zap className="h-3 w-3 text-nest-purple" />
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
