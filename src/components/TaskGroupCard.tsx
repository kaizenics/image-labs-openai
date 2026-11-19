import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bug,
  Check,
  CircleStop,
  Copy,
  Download,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Wand2,
} from "lucide-react";
import { copyText, downloadImage } from "../lib/download";
import { formatCostUsd } from "../lib/pricing";
import type { ImageTask } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconAction, StatusBadge, aspectRatioOf, formatTaskDebug, isI18nKey } from "./TaskCard";

interface TaskGroupCardProps {
  tasks: ImageTask[];
  onPreview: (imageUrl: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onReuseParams: (task: ImageTask) => void;
  onEditImage: (imageUrl: string) => void;
}

const metaClass = "font-mono text-xs tabular-nums text-muted-foreground";

export const TaskGroupCard = memo(function TaskGroupCard({
  tasks,
  onPreview,
  onRetry,
  onCancel,
  onRemove,
  onReuseParams,
  onEditImage,
}: TaskGroupCardProps) {
  const { t } = useTranslation();
  const [messageKey, setMessageKey] = useState("");
  const first = tasks[0];
  const done = tasks.filter((task) => task.status === "success").length;
  const failed = tasks.filter((task) => task.status === "error" || task.status === "cancelled");
  const active = tasks.filter((task) => task.status === "pending" || task.status === "running");
  const costs = tasks.flatMap((task) => (task.estimatedCostUsd != null ? [task.estimatedCostUsd] : []));
  const errorTextOf = (task: ImageTask) => (task.error ? (isI18nKey(task.error) ? t(task.error) : task.error) : "");

  async function handleCopyPrompt() {
    await copyText(first.prompt);
    setMessageKey("tasks.messages.promptCopied");
  }

  async function handleCopyDebug(task: ImageTask) {
    await copyText(formatTaskDebug(task, errorTextOf(task)));
    setMessageKey("tasks.messages.debugCopied");
  }

  async function handleDownload(task: ImageTask) {
    if (!task.imageUrl) return;
    await downloadImage(task.imageUrl, `openai-image-${task.id.slice(0, 8)}`, task.imageMimeType);
    setMessageKey("tasks.messages.downloadStarted");
  }

  return (
    <article className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={active.length ? "running" : failed.length ? "error" : "success"} live className="normal-case">
          {t("tasks.group.progress", { done, total: tasks.length })}
        </StatusBadge>
        <span className={metaClass}>{first.model}</span>
        <span className={metaClass}>{first.size}</span>
        {first.mode === "edit" ? (
          <Badge variant="outline" className="font-medium text-muted-foreground">
            {t("tasks.group.edit")}
          </Badge>
        ) : null}
        <time className={metaClass} dateTime={new Date(first.createdAt).toISOString()}>
          {new Date(first.createdAt).toLocaleString()}
        </time>
        {costs.length ? (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatCostUsd(costs.reduce((sum, cost) => sum + cost, 0))}
          </span>
        ) : null}
      </div>

      <p className="mb-4 line-clamp-3 text-sm leading-6">{first.prompt}</p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {tasks.map((task) => {
          const errorText = errorTextOf(task);
          const isActive = task.status === "pending" || task.status === "running";
          const isFailed = task.status === "error" || task.status === "cancelled";
          return (
            <li key={task.id} className="flex flex-col gap-1">
              <div
                className="relative overflow-hidden rounded-lg border bg-muted"
                style={{ aspectRatio: aspectRatioOf(task.size) }}
              >
                {task.imageUrl ? (
                  <button
                    type="button"
                    className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => onPreview(task.imageUrl as string)}
                    aria-label={t("tasks.previewGeneratedImage")}
                  >
                    <img className="size-full object-contain" src={task.imageUrl} alt={task.prompt} loading="lazy" />
                  </button>
                ) : (
                  <>
                    {isActive ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
                      {isActive ? (
                        <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand" />
                      ) : isFailed ? (
                        <ImageOff aria-hidden="true" className="size-5" />
                      ) : (
                        <ImageIcon aria-hidden="true" className="size-5" />
                      )}
                      <StatusBadge status={task.status}>{t(`tasks.status.${task.status}`)}</StatusBadge>
                      {errorText ? (
                        <span
                          className={`line-clamp-4 break-words ${task.status === "error" ? "text-destructive" : "text-warning"}`}
                          title={errorText}
                        >
                          {errorText}
                        </span>
                      ) : (
                        <span>
                          {task.status === "running"
                            ? t("tasks.generating")
                            : task.imageCached
                              ? t("tasks.restoringCachedImage")
                              : task.status === "success"
                                ? t("tasks.noImageYet")
                                : null}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {isFailed ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => onRetry(task.id)}>
                    <RotateCcw aria-hidden="true" className="!size-3.5" />
                    {t("tasks.actions.retry")}
                  </Button>
                ) : null}
                {isActive ? (
                  <IconAction label={t("tasks.actions.cancel")} icon={CircleStop} onClick={() => onCancel(task.id)} />
                ) : null}
                {task.imageUrl ? (
                  <>
                    <IconAction label={t("tasks.actions.download")} icon={Download} onClick={() => void handleDownload(task)} />
                    <IconAction
                      label={t("tasks.actions.editImage")}
                      icon={Wand2}
                      onClick={() => onEditImage(task.imageUrl as string)}
                    />
                  </>
                ) : null}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="ml-auto size-8" aria-label={t("tasks.actions.more")}>
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("tasks.actions.more")}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-44">
                    {task.status === "error" && task.debug ? (
                      <>
                        <DropdownMenuItem onSelect={() => void handleCopyDebug(task)}>
                          <Bug aria-hidden="true" />
                          {t("tasks.group.copyDebug")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive-soft focus:text-destructive"
                      onSelect={() => onRemove(task.id)}
                    >
                      <Trash2 aria-hidden="true" />
                      {t("tasks.actions.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      {messageKey ? (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-success">
          <Check aria-hidden="true" className="size-3.5" />
          {t(messageKey)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        {failed.length ? (
          <Button type="button" variant="outline" size="sm" onClick={() => failed.forEach((task) => onRetry(task.id))}>
            <RotateCcw aria-hidden="true" />
            {t("tasks.group.retryFailed", { count: failed.length })}
          </Button>
        ) : null}
        {active.length ? (
          <Button type="button" variant="outline" size="sm" onClick={() => active.forEach((task) => onCancel(task.id))}>
            <CircleStop aria-hidden="true" />
            {t("tasks.group.cancelAll")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onReuseParams(tasks.find((task) => task.status === "success") ?? first)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t("tasks.actions.reuseParams")}
        </Button>
        <IconAction label={t("tasks.actions.copyPrompt")} icon={Copy} onClick={() => void handleCopyPrompt()} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          onClick={() => tasks.forEach((task) => onRemove(task.id))}
        >
          <Trash2 aria-hidden="true" />
          {t("tasks.group.deleteAll")}
        </Button>
      </div>
    </article>
  );
});
