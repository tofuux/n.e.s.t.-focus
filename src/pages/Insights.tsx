import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, Brain, Lightbulb, Calendar } from "lucide-react";

const focusData = [
  { day: "Mon", focus: 65, mood: 3 },
  { day: "Tue", focus: 72, mood: 4 },
  { day: "Wed", focus: 58, mood: 2 },
  { day: "Thu", focus: 80, mood: 4 },
  { day: "Fri", focus: 75, mood: 5 },
  { day: "Sat", focus: 45, mood: 3 },
  { day: "Sun", focus: 60, mood: 4 },
];

const taskData = [
  { day: "Mon", completed: 5, created: 3 },
  { day: "Tue", completed: 7, created: 4 },
  { day: "Wed", completed: 3, created: 6 },
  { day: "Thu", completed: 8, created: 2 },
  { day: "Fri", completed: 6, created: 5 },
];

const insights = [
  {
    icon: TrendingUp,
    title: "Peak Performance",
    text: "You're most productive between 9-11 AM on Tuesdays and Thursdays.",
    color: "bg-nest-mint/30 text-nest-mint-foreground",
  },
  {
    icon: Brain,
    title: "Focus Pattern",
    text: "Your focus drops after 2+ hours of continuous work. Schedule breaks every 90 minutes.",
    color: "bg-nest-lavender text-accent-foreground",
  },
  {
    icon: Lightbulb,
    title: "Communication Style",
    text: "Your messages are 20% clearer when you use the AI simplifier before sending.",
    color: "bg-nest-warm/30 text-nest-warm-foreground",
  },
];

const timeline = [
  { date: "Apr 22", type: "meeting", text: "Sprint Planning — 3 action items generated" },
  { date: "Apr 21", type: "task", text: "Completed: Fix authentication bug" },
  { date: "Apr 21", type: "meeting", text: "Design Review — 2 decisions recorded" },
  { date: "Apr 20", type: "task", text: "Started: Q4 Presentation Deck" },
  { date: "Apr 19", type: "insight", text: "Focus score improved 12% this week" },
];

export default function Insights() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Memory & Insights</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Your productivity patterns and history</p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-card p-5 nest-shadow-card">
          <h3 className="font-heading font-semibold text-foreground mb-4">Focus & Mood Trends</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={focusData}>
              <defs>
                <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(230, 70%, 58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(230, 70%, 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 50%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 50%)" />
              <Tooltip
                contentStyle={{
                  background: "hsl(0, 0%, 100%)",
                  border: "1px solid hsl(220, 15%, 90%)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="focus" stroke="hsl(230, 70%, 58%)" fill="url(#focusGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl bg-card p-5 nest-shadow-card">
          <h3 className="font-heading font-semibold text-foreground mb-4">Task Throughput</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={taskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 50%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 50%)" />
              <Tooltip
                contentStyle={{
                  background: "hsl(0, 0%, 100%)",
                  border: "1px solid hsl(220, 15%, 90%)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="completed" fill="hsl(230, 70%, 58%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="created" fill="hsl(260, 60%, 92%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Behavioral Insights */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="font-heading font-semibold text-foreground">Behavioral Insights</h3>
          {insights.map((insight, i) => (
            <div key={i} className={`rounded-2xl p-4 ${insight.color}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <insight.icon className="h-4 w-4" />
                <span className="text-xs font-semibold">{insight.title}</span>
              </div>
              <p className="text-xs opacity-80">{insight.text}</p>
            </div>
          ))}
        </div>

        {/* Memory Timeline */}
        <div className="lg:col-span-2">
          <h3 className="font-heading font-semibold text-foreground mb-3">Memory Timeline</h3>
          <div className="rounded-2xl bg-card p-5 nest-shadow-card">
            <div className="space-y-4">
              {timeline.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full mt-1 ${
                      item.type === "meeting" ? "bg-primary" : item.type === "task" ? "bg-nest-purple" : "bg-nest-mint-foreground"
                    }`} />
                    {i < timeline.length - 1 && <div className="w-px h-8 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{item.text}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                    </div>
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
