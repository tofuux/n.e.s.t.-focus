import { useState } from "react";
import { ChevronDown, ChevronRight, Circle, CheckCircle2, Clock, AlertTriangle, Heart } from "lucide-react";

interface MicroStep {
  text: string;
  done: boolean;
}

interface Task {
  id: number;
  title: string;
  priority: "high" | "medium" | "low";
  stage: "planning" | "execution" | "completion";
  microSteps: MicroStep[];
}

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Prepare Q4 presentation",
    priority: "high",
    stage: "execution",
    microSteps: [
      { text: "Outline key metrics", done: true },
      { text: "Gather data from analytics", done: true },
      { text: "Create slide deck", done: false },
      { text: "Rehearse presentation", done: false },
    ],
  },
  {
    id: 2,
    title: "Review team feedback",
    priority: "medium",
    stage: "planning",
    microSteps: [
      { text: "Collect survey responses", done: true },
      { text: "Categorize themes", done: false },
      { text: "Write summary report", done: false },
    ],
  },
  {
    id: 3,
    title: "Fix authentication bug",
    priority: "high",
    stage: "execution",
    microSteps: [
      { text: "Reproduce the issue", done: true },
      { text: "Identify root cause", done: true },
      { text: "Write the fix", done: false },
      { text: "Test & deploy", done: false },
    ],
  },
  {
    id: 4,
    title: "Update onboarding docs",
    priority: "low",
    stage: "planning",
    microSteps: [
      { text: "Review current docs", done: false },
      { text: "List outdated sections", done: false },
      { text: "Rewrite and publish", done: false },
    ],
  },
];

const priorityColors: Record<string, string> = {
  high: "bg-nest-rose text-nest-rose-foreground",
  medium: "bg-nest-warm text-nest-warm-foreground",
  low: "bg-nest-mint text-nest-mint-foreground",
};

const stageLabels: Record<string, { label: string; color: string }> = {
  planning: { label: "Planning", color: "text-nest-purple" },
  execution: { label: "In Progress", color: "text-primary" },
  completion: { label: "Done", color: "text-nest-mint-foreground" },
};

export default function Tasks() {
  const [tasks, setTasks] = useState(initialTasks);
  const [expandedId, setExpandedId] = useState<number | null>(1);

  const totalSteps = tasks.reduce((sum, t) => sum + t.microSteps.length, 0);
  const doneSteps = tasks.reduce((sum, t) => sum + t.microSteps.filter(s => s.done).length, 0);
  const overwhelm = tasks.filter(t => t.priority === "high" && t.stage !== "completion").length >= 3;

  const toggleStep = (taskId: number, stepIndex: number) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, microSteps: t.microSteps.map((s, i) => (i === stepIndex ? { ...s, done: !s.done } : s)) }
          : t
      )
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Smart Tasks</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Break big goals into achievable micro-steps</p>
      </div>

      {/* Progress overview */}
      <div className="rounded-2xl bg-card p-5 nest-shadow-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Overall Progress</span>
          <span className="text-sm font-semibold text-foreground">{doneSteps}/{totalSteps} steps</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-full nest-gradient-primary transition-all duration-700"
            style={{ width: `${(doneSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Overwhelm nudge */}
      {overwhelm && (
        <div className="rounded-2xl bg-nest-peach/30 border border-nest-peach p-4 flex items-start gap-3 animate-fade-in-up">
          <Heart className="h-5 w-5 text-nest-peach-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-nest-peach-foreground">Feeling overwhelmed?</p>
            <p className="text-xs text-nest-peach-foreground/70 mt-0.5">
              You have multiple high-priority tasks. Try focusing on just one micro-step at a time.
            </p>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-3">
        {tasks.map((task) => {
          const isExpanded = expandedId === task.id;
          const completedSteps = task.microSteps.filter(s => s.done).length;
          const progress = (completedSteps / task.microSteps.length) * 100;

          return (
            <div key={task.id} className="rounded-2xl bg-card nest-shadow-card overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : task.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{task.title}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs font-medium ${stageLabels[task.stage].color}`}>
                      {stageLabels[task.stage].label}
                    </span>
                    <span className="text-xs text-muted-foreground">{completedSteps}/{task.microSteps.length} steps</span>
                  </div>
                </div>
                <div className="w-16">
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full nest-gradient-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-1.5 animate-fade-in-up">
                  {task.microSteps.map((step, i) => (
                    <button
                      key={i}
                      onClick={() => toggleStep(task.id, i)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={`text-sm ${step.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {step.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
