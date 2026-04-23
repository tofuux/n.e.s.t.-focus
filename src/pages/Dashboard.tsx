import { FocusScore } from "@/components/FocusScore";
import { MoodCheckIn } from "@/components/MoodCheckIn";
import { SmartRecommendation } from "@/components/SmartRecommendation";
import { Calendar, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

const upcomingMeetings = [
  { title: "Sprint Planning", time: "10:00 AM", duration: "45 min" },
  { title: "Design Review", time: "2:00 PM", duration: "30 min" },
];

const tasks = [
  { title: "Update API docs", priority: "high", status: "in-progress" },
  { title: "Code review PR #42", priority: "medium", status: "todo" },
  { title: "Fix login bug", priority: "high", status: "todo" },
];

const priorityColors: Record<string, string> = {
  high: "bg-nest-rose text-nest-rose-foreground",
  medium: "bg-nest-warm text-nest-warm-foreground",
  low: "bg-nest-mint text-nest-mint-foreground",
};

export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Good morning ☀️</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Here's your cognitive overview for today</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          <SmartRecommendation />

          {/* Mood + Focus row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-card p-5 nest-shadow-card">
              <MoodCheckIn />
            </div>
            <div className="rounded-2xl bg-card p-5 nest-shadow-card flex flex-col items-center justify-center">
              <FocusScore score={73} />
              <p className="text-xs text-muted-foreground mt-3">Your focus is above average today</p>
            </div>
          </div>

          {/* Tasks */}
          <div className="rounded-2xl bg-card p-5 nest-shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-foreground">Active Tasks</h3>
              <span className="text-xs text-muted-foreground">{tasks.length} items</span>
            </div>
            <div className="space-y-2.5">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground flex-1">{task.title}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Meetings */}
          <div className="rounded-2xl bg-card p-5 nest-shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-heading font-semibold text-foreground">Upcoming</h3>
            </div>
            <div className="space-y-3">
              {upcomingMeetings.map((meeting, i) => (
                <div key={i} className="p-3 rounded-xl bg-accent/40 border border-border/30">
                  <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{meeting.time} · {meeting.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cognitive Support */}
          <div className="rounded-2xl bg-nest-mint/30 border border-nest-mint p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-nest-mint-foreground" />
              <h3 className="font-heading text-sm font-semibold text-nest-mint-foreground">Wellness Check</h3>
            </div>
            <p className="text-xs text-nest-mint-foreground/80">
              You've been working for 2.5 hours straight. Consider a 5-minute break to recharge your focus.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="rounded-2xl bg-card p-5 nest-shadow-card">
            <h3 className="font-heading font-semibold text-foreground mb-3">Today's Progress</h3>
            <div className="space-y-3">
              {[
                { label: "Tasks Completed", value: "4/7", pct: 57 },
                { label: "Focus Time", value: "3.2h", pct: 64 },
                { label: "Meetings", value: "1/3", pct: 33 },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="font-medium text-foreground">{stat.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full nest-gradient-primary transition-all duration-700"
                      style={{ width: `${stat.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
