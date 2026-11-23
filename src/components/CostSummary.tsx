import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import type { ImageTask } from "../types";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { formatCostUsd } from "../lib/pricing";
import { STORAGE_KEYS } from "../lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Notice } from "./Notice";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Estimated spend from the tracked tasks (today, last 7 days, all) with an optional daily budget warning. */
export function CostSummary({ tasks }: { tasks: ImageTask[] }) {
  const { t } = useTranslation();
  const [rawBudget, setBudget] = useLocalStorage<number>(STORAGE_KEYS.dailyBudget, 0);
  const budget = typeof rawBudget === "number" && rawBudget > 0 ? rawBudget : 0;

  const totals = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const weekStart = startOfToday - 6 * DAY_MS;
    let today = 0;
    let week = 0;
    let all = 0;
    let counted = 0;
    for (const task of tasks) {
      if (task.estimatedCostUsd == null) continue;
      counted += 1;
      all += task.estimatedCostUsd;
      if (task.createdAt >= weekStart) week += task.estimatedCostUsd;
      if (task.createdAt >= startOfToday) today += task.estimatedCostUsd;
    }
    return { today, week, all, counted };
  }, [tasks]);

  if (totals.counted === 0 && budget === 0) return null;

  const overBudget = budget > 0 && totals.today > budget;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        {([["today", totals.today], ["week", totals.week], ["all", totals.all]] as const).map(([key, value]) => (
          <span key={key}>
            {t(`tasks.cost.${key}`)} <span className="font-mono text-foreground">{formatCostUsd(value)}</span>
          </span>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 gap-1 px-1.5 text-xs">
              <Wallet aria-hidden="true" className="!size-3.5" />
              {t("tasks.cost.budget")}
              {budget > 0 ? <span className="font-mono">{formatCostUsd(budget)}</span> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-64 gap-2">
            <Label htmlFor="daily-budget">{t("tasks.cost.budget")}</Label>
            <Input
              id="daily-budget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              placeholder="0"
              value={budget || ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                setBudget(Number.isFinite(value) && value > 0 ? value : 0);
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground">{t("tasks.cost.budgetHint")}</p>
          </PopoverContent>
        </Popover>
      </div>
      {overBudget ? (
        <Notice variant="warning">
          {t("tasks.cost.overBudget", { spent: formatCostUsd(totals.today), budget: formatCostUsd(budget) })}
        </Notice>
      ) : null}
    </div>
  );
}
