import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, Sparkles, Target, Trash2, TrendingUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Goal } from "@/lib/types";
import { cn, formatDate, GOAL_LABELS, GOAL_UNITS, percent } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, RadialProgress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { GoalDialog } from "@/components/goals/goal-dialog";

export function GoalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [recommendation, setRecommendation] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const goals = useQuery({ queryKey: ["goals", "all"], queryFn: () => api.goals.list(true) });
  const recommendations = useQuery({ queryKey: ["goals", "recommendations"], queryFn: api.goals.recommendations });

  const remove = useMutation({
    mutationFn: () => api.goals.remove(deleteTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Goal deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error("Could not delete goal", err instanceof ApiError ? err.message : undefined),
  });

  const { active, finished } = useMemo(() => {
    const items = goals.data?.items ?? [];
    return {
      active: items.filter((goal) => goal.is_active !== false && !goal.completed),
      finished: items.filter((goal) => goal.is_active === false || goal.completed),
    };
  }, [goals.data?.items]);

  function openCreate() {
    setEditing(null);
    setRecommendation(null);
    setDialogOpen(true);
  }

  function adopt(rec: Goal) {
    setEditing(null);
    setRecommendation(rec);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <PageHeader
        eyebrow="Direction"
        title="Goals"
        description="Targets measured from the sessions you record. Nothing is estimated or inflated."
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> New goal</Button>}
      />

      {goals.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
        </div>
      ) : active.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => {
                setEditing(goal);
                setRecommendation(null);
                setDialogOpen(true);
              }}
              onDelete={() => setDeleteTarget(goal)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title="No active goals"
          description="A goal gives your reading a direction without turning it into a chore. Start with one."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openCreate}><Plus className="h-4 w-4" /> Create a goal</Button>
              {recommendations.data?.items.length ? (
                <Button variant="outline" onClick={() => adopt(recommendations.data!.items[0])}>
                  <Sparkles className="h-4 w-4" /> Use a suggestion
                </Button>
              ) : null}
            </div>
          }
        />
      )}

      {finished.length > 0 && (
        <section className="space-y-3">
          <button
            onClick={() => setIncludeInactive((value) => !value)}
            className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2 className="h-4 w-4" />
            {finished.length} completed or inactive {includeInactive ? "shown" : "hidden"}
          </button>
          {includeInactive && (
            <div className="grid gap-3 lg:grid-cols-2">
              {finished.map((goal) => (
                <div key={goal.id} className="surface flex items-center gap-4 p-4 opacity-80">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{goal.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {goal.current_value ?? 0} / {goal.target_value} {GOAL_UNITS[goal.goal_type]} · ended {formatDate(goal.end_date)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(goal)} aria-label="Delete goal">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Suggested from your pace
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Based on the last 90 days. Suggestions appear once there is enough data.</p>
        </div>
        {recommendations.isLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : recommendations.data?.items.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {recommendations.data.items.map((rec) => (
              <Card key={rec.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold">{rec.name}</p>
                      <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{rec.rationale}</p>
                      {rec.evidence && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(rec.evidence).map(([key, value]) => (
                            <Badge key={key} className="bg-muted text-[10px]">
                              {key.replaceAll("_", " ")}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => adopt(rec)}>
                      <TrendingUp className="h-3.5 w-3.5" /> Adopt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            Log at least three reading days in the last 90 days to unlock pace-based suggestions.
          </div>
        )}
      </section>

      <GoalDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          setRecommendation(null);
        }}
        goal={editing}
        recommendation={recommendation}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this goal?"
        description={deleteTarget?.name ?? ""}
        confirmLabel="Delete goal"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete }: { goal: Goal; onEdit: () => void; onDelete: () => void }) {
  const pct = percent(goal.percent ?? 0);
  const unit = GOAL_UNITS[goal.goal_type] ?? "units";
  return (
    <Card className={cn("overflow-hidden", goal.completed && "border-success/30")}>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <RadialProgress value={pct} size={104} stroke={7}>
          <span className="font-display text-xl font-semibold tabular-nums">{Math.round(pct)}%</span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">complete</span>
        </RadialProgress>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-lg font-semibold leading-snug">{goal.name}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {GOAL_LABELS[goal.goal_type]} · {goal.period}
                {goal.genre ? ` · ${goal.genre}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-0.5">
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit goal"><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete goal"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          </div>
          <p className="mt-2 text-[13px] tabular-nums">
            <strong className="text-base">{goal.current_value ?? 0}</strong>
            <span className="text-muted-foreground"> / {goal.target_value} {unit}</span>
          </p>
          <Progress value={pct} className="mt-2 h-1.5" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{Math.max(0, goal.days_remaining ?? 0)} days left</span>
            <span>needs {(goal.required_pace ?? 0).toFixed(1)} {unit}/day</span>
            <span>{goal.remaining ?? 0} {unit} remaining</span>
          </div>
          {goal.milestones && goal.milestones.length > 0 && (
            <div className="mt-3 flex items-center gap-1">
              {goal.milestones.map((milestone) => (
                <span
                  key={milestone.percent}
                  title={milestone.label}
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-1.5 text-[9.5px] font-medium",
                    milestone.reached ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70",
                  )}
                >
                  {milestone.percent}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
