import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Circle, Heart, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteMeeting, getMeetings, type MeetingRow } from "@/lib/api";

interface DerivedTask {
  id: string;
  text: string;
  done: boolean;
  source: "action" | "decision";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => String(item));
}

function buildTasks(meeting: MeetingRow | null): DerivedTask[] {
  if (!meeting) return [];
  const actions = asStringArray(meeting.action_items).map((text, idx) => ({
    id: `${meeting.id}-a-${idx}`,
    text,
    done: false,
    source: "action" as const,
  }));
  const decisions = asStringArray(meeting.decisions).map((text, idx) => ({
    id: `${meeting.id}-d-${idx}`,
    text,
    done: false,
    source: "decision" as const,
  }));
  return [...actions, ...decisions];
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [taskStates, setTaskStates] = useState<Record<string, boolean>>({});

  const meetingsQuery = useQuery({
    queryKey: ["meetings"],
    queryFn: getMeetings,
  });

  const meetings = meetingsQuery.data ?? [];

  useEffect(() => {
    if (!meetings.length) {
      setSelectedMeetingId("");
      return;
    }
    if (!selectedMeetingId || !meetings.some((m) => m.id === selectedMeetingId)) {
      setSelectedMeetingId(meetings[0].id);
    }
  }, [meetings, selectedMeetingId]);

  const selectedMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  );

  const tasks = useMemo(() => {
    const base = buildTasks(selectedMeeting);
    return base.map((task) => ({
      ...task,
      done: taskStates[task.id] ?? task.done,
    }));
  }, [selectedMeeting, taskStates]);

  const totalSteps = tasks.length;
  const doneSteps = tasks.filter((task) => task.done).length;
  const progressPct = totalSteps ? (doneSteps / totalSteps) * 100 : 0;
  const overwhelm = tasks.filter((task) => task.source === "action" && !task.done).length >= 4;

  const deleteMutation = useMutation({
    mutationFn: deleteMeeting,
    onSuccess: async () => {
      toast.success("Meeting deleted");
      setTaskStates({});
      await queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const toggleStep = (taskId: string) => {
    setTaskStates((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Smart Tasks</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Task list generated from saved meeting decisions and action items</p>
      </div>

      <div className="rounded-2xl bg-card p-5 nest-shadow-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Meeting source</p>
            <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId} disabled={!meetings.length}>
              <SelectTrigger>
                <SelectValue placeholder={meetingsQuery.isLoading ? "Loading meetings..." : "Select a meeting"} />
              </SelectTrigger>
              <SelectContent>
                {meetings.map((meeting) => (
                  <SelectItem key={meeting.id} value={meeting.id}>
                    {meeting.title} - {format(new Date(meeting.started_at), "MMM d, HH:mm")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedMeeting && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete meeting
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the meeting, transcript, summary, decisions, and tasks from the database permanently.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate(selectedMeeting.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {selectedMeeting && (
          <div className="rounded-xl border border-border/50 bg-background/60 p-3">
            <p className="text-sm text-foreground">{selectedMeeting.summary || "No summary available for this meeting."}</p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Meeting Task Progress</span>
            <span className="text-sm font-semibold text-foreground">
              {doneSteps}/{totalSteps} done
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full nest-gradient-primary transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {overwhelm && (
        <div className="rounded-2xl bg-nest-peach/30 border border-nest-peach p-4 flex items-start gap-3 animate-fade-in-up">
          <Heart className="h-5 w-5 text-nest-peach-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-nest-peach-foreground">A lot is on your plate</p>
            <p className="text-xs text-nest-peach-foreground/70 mt-0.5">
              Focus on one action item first, then come back to the next.
            </p>
          </div>
        </div>
      )}

      {meetingsQuery.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading meetings...
        </p>
      )}
      {meetingsQuery.isError && <p className="text-sm text-destructive">Could not load meeting tasks.</p>}
      {!meetingsQuery.isLoading && selectedMeeting && !tasks.length && (
        <p className="text-sm text-muted-foreground">This meeting has no tasks/decisions saved yet.</p>
      )}
      {!meetingsQuery.isLoading && !selectedMeeting && <p className="text-sm text-muted-foreground">No meetings found. End and save a meeting first.</p>}

      {!!tasks.length && (
        <div className="space-y-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => toggleStep(task.id)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card nest-shadow-card hover:bg-muted/30 transition-colors text-left"
            >
              {task.done ? (
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.text}</span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      task.source === "action" ? "bg-nest-mint text-nest-mint-foreground" : "bg-nest-warm text-nest-warm-foreground"
                    }`}
                  >
                    {task.source === "action" ? "task" : "decision"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
