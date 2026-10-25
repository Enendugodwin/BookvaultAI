import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Goal, GoalInput } from "@/lib/types";
import { GOAL_LABELS, GOAL_UNITS, addDaysISO, todayISO } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type GoalType = Goal["goal_type"];
type GoalPeriod = Goal["period"];

const TYPES: { value: GoalType; label: string; unit: string }[] = [
  { value: "books", label: "Books finished", unit: "books" },
  { value: "pages", label: "Pages read", unit: "pages" },
  { value: "minutes", label: "Minutes read", unit: "minutes" },
  { value: "hours", label: "Hours read", unit: "hours" },
  { value: "sessions", label: "Reading sessions", unit: "sessions" },
  { value: "streak", label: "Day streak", unit: "days" },
  { value: "genre_books", label: "Books in a genre", unit: "books" },
];

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom dates" },
];

function endOfPeriod(period: GoalPeriod) {
  const today = new Date(`${todayISO()}T00:00:00`);
  if (period === "week") return addDaysISO(todayISO(), 6);
  if (period === "month") return new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  if (period === "year") return `${today.getFullYear()}-12-31`;
  return addDaysISO(todayISO(), 29);
}

function defaultTarget(type: GoalType) {
  switch (type) {
    case "books":
    case "genre_books":
      return "12";
    case "pages":
      return "3000";
    case "minutes":
      return "600";
    case "hours":
      return "10";
    case "sessions":
      return "20";
    case "streak":
      return "7";
    default:
      return "10";
  }
}

export function GoalDialog({
  open,
  onClose,
  goal,
  recommendation,
}: {
  open: boolean;
  onClose: () => void;
  goal?: Goal | null;
  recommendation?: Goal | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(goal);
  const source = goal ?? recommendation;
  const [name, setName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("books");
  const [period, setPeriod] = useState<GoalPeriod>("year");
  const [target, setTarget] = useState("12");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(endOfPeriod("year"));
  const [genre, setGenre] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const type = (source?.goal_type as GoalType) ?? "books";
    const nextPeriod = (source?.period as GoalPeriod) ?? "year";
    setGoalType(type);
    setPeriod(nextPeriod);
    setName(source?.name ?? "");
    setTarget(source ? String(source.target_value) : defaultTarget(type));
    setStartDate(source?.start_date ?? todayISO());
    setEndDate(source?.end_date ?? endOfPeriod(nextPeriod));
    setGenre(source?.genre ?? "");
    setError(null);
  }, [open, source]);

  function changePeriod(next: GoalPeriod) {
    setPeriod(next);
    if (next !== "custom") {
      setEndDate(endOfPeriod(next));
      if (next !== "year") setStartDate(todayISO());
    }
  }

  function changeType(next: GoalType) {
    setGoalType(next);
    if (!isEdit && !recommendation) {
      setTarget(defaultTarget(next));
      if (!name) setName(GOAL_LABELS[next] ?? "");
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: GoalInput = {
        name: name.trim() || `${GOAL_LABELS[goalType]} goal`,
        goal_type: goalType,
        period,
        target_value: Number(target),
        start_date: startDate,
        end_date: endDate,
        genre: goalType === "genre_books" ? genre.trim() || null : null,
      };
      if (isEdit) {
        return api.goals.update(goal!.id, {
          name: payload.name,
          target_value: payload.target_value,
          start_date: payload.start_date,
          end_date: payload.end_date,
          genre: payload.genre,
        });
      }
      return api.goals.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(isEdit ? "Goal updated" : "Goal created");
      onClose();
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? err.message : "Could not save this goal.";
      setError(detail);
    },
  });

  const unit = GOAL_UNITS[goalType] ?? "units";
  const previewDays = Math.max(1, Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000) + 1);
  const perDay = Number(target) > 0 ? (Number(target) / previewDays).toFixed(1) : "—";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit goal" : "Set a reading goal"}
      description={recommendation ? "We have pre-filled this from your recent pace. Adjust anything." : "Choose a target you can sustain, then let the data do the rest."}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!target || Number(target) <= 0 || (goalType === "genre_books" && !genre.trim())}>
            {isEdit ? "Save goal" : "Create goal"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div>
          <Label htmlFor="goal-name">Goal name</Label>
          <Input id="goal-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Read 24 books this year" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="goal-type">Measure</Label>
            <Select id="goal-type" value={goalType} onChange={(event) => changeType(event.target.value as GoalType)} disabled={isEdit}>
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="goal-period">Period</Label>
            <Select id="goal-period" value={period} onChange={(event) => changePeriod(event.target.value as GoalPeriod)} disabled={isEdit}>
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className={goalType === "genre_books" ? "grid gap-4 sm:grid-cols-2" : ""}>
          <div>
            <Label htmlFor="goal-target">Target ({unit})</Label>
            <Input id="goal-target" type="number" min={1} step={goalType === "hours" ? "0.5" : "1"} value={target} onChange={(event) => setTarget(event.target.value)} />
          </div>
          {goalType === "genre_books" && (
            <div>
              <Label htmlFor="goal-genre">Genre</Label>
              <Input id="goal-genre" value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="History" />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="goal-start">Start date</Label>
            <Input id="goal-start" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPeriod("custom"); }} />
          </div>
          <div>
            <Label htmlFor="goal-end">End date</Label>
            <Input id="goal-end" type="date" value={endDate} min={startDate} onChange={(event) => { setEndDate(event.target.value); setPeriod("custom"); }} />
          </div>
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-[11.5px] leading-5 text-muted-foreground">
          That is about <strong className="text-foreground">{perDay} {unit}</strong> per day across {previewDays} days.
          Progress is computed from your recorded sessions, not estimates.
        </p>
      </form>
    </Dialog>
  );
}
