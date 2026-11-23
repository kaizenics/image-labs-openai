import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus } from "lucide-react";
import type { ImageTask } from "../types";
import { groupTasks } from "../lib/taskGroups";
import { TaskCard } from "./TaskCard";
import { TaskGroupCard } from "./TaskGroupCard";
import { Notice } from "./Notice";
import { CostSummary } from "./CostSummary";

const MAX_RENDERED_TASKS = 200;

interface TaskQueueProps {
  tasks: ImageTask[];
  onPreview: (imageUrl: string, gallery: string[]) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearTaskImage: (id: string) => void;
  onReuseParams: (task: ImageTask) => void;
  onEditImage: (imageUrl: string) => void;
  onUseAsPrompt: (text: string) => void;
}

export const TaskQueue = memo(function TaskQueue({
  tasks,
  onPreview,
  onRetry,
  onCancel,
  onRemove,
  onClearTaskImage,
  onReuseParams,
  onEditImage,
  onUseAsPrompt,
}: TaskQueueProps) {
  const { t } = useTranslation();

  const { stats, groups, visibleCount, hiddenCount } = useMemo(() => {
    const counts = { pending: 0, running: 0, success: 0, error: 0 };

    for (const task of tasks) {
      if (task.status in counts) {
        counts[task.status as keyof typeof counts] += 1;
      }
    }

    const { groups, hiddenCount } = groupTasks(tasks, MAX_RENDERED_TASKS);

    return { stats: counts, groups, visibleCount: tasks.length - hiddenCount, hiddenCount };
  }, [tasks]);

  const handlePreview = useCallback(
    (imageUrl: string) =>
      onPreview(
        imageUrl,
        groups.flat().flatMap((task) => (task.mode !== "vision" && task.imageUrl ? [task.imageUrl] : [])),
      ),
    [onPreview, groups],
  );

  return (
    <section aria-labelledby="task-queue-heading" className="space-y-4">
      <h2 id="task-queue-heading" className="sr-only">
        {t("tasks.title")}
      </h2>

      {tasks.length > 0 ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <p>{t("tasks.stats", stats)}</p>
          <p className="font-mono">{t("tasks.total", { count: tasks.length })}</p>
        </div>
      ) : null}

      <CostSummary tasks={tasks} />

      {hiddenCount > 0 ? (
        <Notice>{t("tasks.showingRecent", { shown: visibleCount, hidden: hiddenCount })}</Notice>
      ) : null}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-20 text-center">
          <span className="grid size-11 place-items-center rounded-lg border bg-card text-muted-foreground">
            <ImagePlus aria-hidden="true" className="size-5" />
          </span>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">{t("tasks.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) =>
            group.length > 1 ? (
              <TaskGroupCard
                key={group[0].id}
                tasks={group}
                onPreview={handlePreview}
                onRetry={onRetry}
                onCancel={onCancel}
                onRemove={onRemove}
                onReuseParams={onReuseParams}
                onEditImage={onEditImage}
              />
            ) : (
              <TaskCard
                key={group[0].id}
                task={group[0]}
                onPreview={handlePreview}
                onRetry={onRetry}
                onCancel={onCancel}
                onRemove={onRemove}
                onClearImage={onClearTaskImage}
                onReuseParams={onReuseParams}
                onEditImage={onEditImage}
                onUseAsPrompt={onUseAsPrompt}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
});
