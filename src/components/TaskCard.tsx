import { memo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CircleStop,
  ClipboardCopy,
  Copy,
  Download,
  FileDown,
  Image as ImageIcon,
  ImageOff,
  Link,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Bug,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { copyImage, copyText, downloadImage, downloadText } from "../lib/download";
import { formatCostUsd } from "../lib/pricing";
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
import { cn } from "@/lib/utils";
import { Disclosure } from "./Disclosure";
import { Notice } from "./Notice";

import type { ImageTask } from "../types";

interface TaskCardProps {
  task: ImageTask;
  onPreview: (imageUrl: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearImage: (id: string) => void;
  onReuseParams: (task: ImageTask) => void;
  onEditImage: (imageUrl: string) => void;
  onUseAsPrompt: (text: string) => void;
}

export const statusStyles: Record<ImageTask["status"], string> = {
  pending: "border-transparent bg-muted text-muted-foreground",
  running: "border-brand/30 bg-brand-soft text-foreground",
  success: "border-success/30 bg-success-soft text-success",
  error: "border-destructive/30 bg-destructive-soft text-destructive",
  cancelled: "border-warning/30 bg-warning-soft text-warning",
};

/** Status pill. `live` announces changes politely; use it once per task, not per tile. */
export function StatusBadge({
  status,
  children,
  live = false,
  className,
}: {
  status: ImageTask["status"];
  children: ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 px-2 font-medium capitalize", statusStyles[status], className)}
      aria-live={live ? "polite" : undefined}
    >
      {status === "running" ? <Loader2 aria-hidden="true" className="size-3 animate-spin text-brand" /> : null}
      {children}
    </Badge>
  );
}

/** Icon-only action with a tooltip; the label doubles as the accessible name. */
export function IconAction({
  label,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn("size-8", className)} aria-label={label} onClick={onClick}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function aspectRatioOf(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  return match ? `${match[1]} / ${match[2]}` : "1 / 1";
}

function formatElapsed(task: ImageTask) {
  if (!task.startedAt) {
    return "-";
  }

  const end = task.finishedAt ?? Date.now();
  return `${Math.max(0, (end - task.startedAt) / 1000).toFixed(1)}s`;
}

// Some persisted error strings are stored as i18n keys (e.g. "tasks.messages.taskCancelled")
// so they can be re-translated when the user switches language. Anything else (such as
// raw API error responses) is rendered as-is.
export function isI18nKey(value: string) {
  return value.startsWith("tasks.messages.") || value.startsWith("errors.");
}

export function formatTaskDebug(task: ImageTask, errorText: string) {
  return JSON.stringify(
    {
      id: task.id,
      status: task.status,
      error: errorText || undefined,
      model: task.model,
      size: task.size,
      responseFormat: task.responseFormat,
      imageCached: task.imageCached,
      imageSize: task.imageSize,
      outputText: task.outputText,
      debug: task.debug,
    },

    null,
    2,
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all font-mono tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

export const TaskCard = memo(function TaskCard({ task, onPreview, onRetry, onCancel, onRemove, onClearImage, onReuseParams, onEditImage, onUseAsPrompt }: TaskCardProps) {
  const { t } = useTranslation();
  const [messageKey, setMessageKey] = useState<string>("");
  const isVisionTask = task.mode === "vision";
  const hasImage = Boolean(task.imageUrl);
  const hasStoredImage = hasImage || Boolean(task.imageCached);
  const hasOutputText = Boolean(task.outputText?.trim());
  const hasDebug = Boolean(task.debug);

  const canCancel = task.status === "pending" || task.status === "running";
  const canRetry = task.status === "error" || task.status === "cancelled";

  async function handleCopyImage() {
    if (!task.imageUrl) {
      return;
    }

    await copyText(task.imageUrl);
    setMessageKey("tasks.messages.imageUrlCopied");
  }

  async function handleCopyImageFile() {
    if (!task.imageUrl) {
      return;
    }

    try {
      await copyImage(task.imageUrl);
      setMessageKey("tasks.messages.imageCopied");
    } catch {
      toast.error(t("tasks.messages.imageCopyFailed"));
    }
  }

  async function handleCopyPrompt() {
    await copyText(task.prompt);
    setMessageKey("tasks.messages.promptCopied");
  }

  async function handleCopyOutputText() {
    if (!task.outputText) {
      return;
    }

    await copyText(task.outputText);
    setMessageKey("tasks.messages.outputCopied");
  }

  function handleDownloadOutputText() {
    if (!task.outputText) {
      return;
    }

    downloadText(task.outputText, `openai-ocr-${task.id.slice(0, 8)}`);
    setMessageKey("tasks.messages.outputDownloadStarted");
  }

  async function handleCopyDebug() {
    if (!hasDebug) {

      return;
    }

    await copyText(formatTaskDebug(task, errorText));
    setMessageKey("tasks.messages.debugCopied");
  }

  async function handleDownload() {
    if (!task.imageUrl) {
      return;
    }

    await downloadImage(task.imageUrl, `openai-image-${task.id.slice(0, 8)}`, task.imageMimeType);

    setMessageKey("tasks.messages.downloadStarted");
  }

  function handleClearImage() {
    if (!hasStoredImage) {
      return;
    }

    onClearImage(task.id);
    setMessageKey("tasks.messages.imageCacheDeleted");
  }

  const errorText = task.error
    ? isI18nKey(task.error)
      ? t(task.error)
      : task.error
    : "";
  const debugText = hasDebug ? formatTaskDebug(task, errorText) : "";
  const placeholderText = isVisionTask
    ? task.status === "running"
      ? t("tasks.analyzing")
      : t("tasks.noTextYet")
    : task.imageCached
      ? t("tasks.restoringCachedImage")
      : task.status === "running"
        ? t("tasks.generating")
        : t("tasks.noImageYet");

  const retryButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => onRetry(task.id)}>
      <RotateCcw aria-hidden="true" />
      {t("tasks.actions.retry")}
    </Button>
  );

  return (
    <article className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <div className="grid md:grid-cols-[240px_1fr]">
        <div className="flex items-center justify-center border-b bg-muted md:border-b-0 md:border-r">
          {isVisionTask ? (
            <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
              {task.inputThumbnail ? (
                <img
                  className="size-20 rounded-md border object-cover"
                  src={task.inputThumbnail}
                  alt={t("tasks.fields.inputImages")}
                />
              ) : (
                <span className="grid size-12 place-items-center rounded-md border bg-background">
                  <ScanText aria-hidden="true" className="size-5" />
                </span>
              )}
              <span className="flex items-center gap-1.5 text-xs">
                {task.status === "running" ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-brand" /> : null}
                {placeholderText}
              </span>
            </div>
          ) : (
            <div className="relative max-h-80 w-full" style={{ aspectRatio: aspectRatioOf(task.size) }}>
              {task.imageUrl ? (
                <button
                  type="button"
                  className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onPreview(task.imageUrl as string)}
                  aria-label={t("tasks.previewGeneratedImage")}
                >
                  <img className="size-full object-contain" src={task.imageUrl} alt={task.prompt} loading="lazy" />
                </button>
              ) : canCancel ? (
                <>
                  <Skeleton className="absolute inset-0 rounded-none" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                    <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand" />
                    {placeholderText}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                  {canRetry ? (
                    <ImageOff aria-hidden="true" className="size-5" />
                  ) : (
                    <ImageIcon aria-hidden="true" className="size-5" />
                  )}
                  {placeholderText}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge status={task.status} live>
              {t(`tasks.status.${task.status}`)}
            </StatusBadge>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {t("tasks.elapsed", { value: formatElapsed(task) })}
            </span>
            <time className="font-mono text-xs tabular-nums text-muted-foreground" dateTime={new Date(task.createdAt).toISOString()}>
              {new Date(task.createdAt).toLocaleString()}
            </time>
            {task.imageCached ? (
              <Badge variant="outline" className="font-medium text-muted-foreground">
                {t("tasks.cache.cachedBadge")}
              </Badge>
            ) : null}
          </div>

          <p className="line-clamp-3 text-sm leading-6">{task.prompt}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
            <MetaItem label={t("tasks.fields.model")}>{task.model}</MetaItem>
            {isVisionTask ? (
              <>
                <MetaItem label={t("tasks.fields.inputImages")}>{task.inputImageCount ?? 0}</MetaItem>
                <MetaItem label={t("tasks.fields.detail")}>{task.visionDetail ?? "-"}</MetaItem>
              </>
            ) : (
              <>
                <MetaItem label={t("tasks.fields.size")}>{task.size}</MetaItem>
                <MetaItem label={t("tasks.fields.format")}>{task.responseFormat}</MetaItem>
              </>
            )}
            {task.usage && (task.usage.inputTokens || task.usage.outputTokens) ? (
              <MetaItem label={t("tasks.fields.tokens")}>
                {task.usage.inputTokens != null && (
                  <span>{t("tasks.fields.tokensIn")} {task.usage.inputTokens.toLocaleString()}</span>
                )}
                {task.usage.outputTokens != null && (
                  <span className="ml-2">{t("tasks.fields.tokensOut")} {task.usage.outputTokens.toLocaleString()}</span>
                )}
                {task.estimatedCostUsd != null && (
                  <span className="ml-2 text-muted-foreground">≈ {formatCostUsd(task.estimatedCostUsd)}</span>
                )}
              </MetaItem>
            ) : task.estimatedCostUsd != null ? (
              <MetaItem label={t("tasks.fields.cost")}>
                {formatCostUsd(task.estimatedCostUsd)}
                <span className="ml-1 text-muted-foreground">
                  ({task.costMethod === "per-token" ? "token" : "img"})
                </span>
              </MetaItem>
            ) : task.status === "success" ? (
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("tasks.fields.cost")}</dt>
                <dd className="mt-0.5 text-muted-foreground">{t("tasks.fields.costUnknown")}</dd>
              </div>
            ) : null}
          </dl>

          {hasOutputText ? (
            <div className="rounded-md border bg-muted/40">
              <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{t("tasks.outputText")}</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm leading-6">
                {task.outputText}
              </pre>
            </div>
          ) : null}

          {errorText ? (
            <Notice variant={task.status === "cancelled" ? "warning" : "error"} action={canRetry ? retryButton : undefined}>
              <span className="break-words">{errorText}</span>
            </Notice>
          ) : null}

          {debugText ? (
            <Disclosure title={t("tasks.debugDetails")} className="text-xs">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                {debugText}
              </pre>
            </Disclosure>
          ) : null}

          {messageKey ? (
            <p role="status" className="flex items-center gap-1.5 text-xs text-success">
              <Check aria-hidden="true" className="size-3.5" />
              {t(messageKey)}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            {canRetry && !errorText ? retryButton : null}
            {canCancel ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onCancel(task.id)}>
                <CircleStop aria-hidden="true" />
                {t("tasks.actions.cancel")}
              </Button>
            ) : null}
            {!isVisionTask && hasImage ? (
              <IconAction label={t("tasks.actions.download")} icon={Download} onClick={() => void handleDownload()} />
            ) : null}
            {!isVisionTask && hasImage ? (
              <IconAction label={t("tasks.actions.copyImage")} icon={ClipboardCopy} onClick={() => void handleCopyImageFile()} />
            ) : null}
            {!isVisionTask && hasImage ? (
              <IconAction
                label={t("tasks.actions.editImage")}
                icon={Wand2}
                onClick={() => task.imageUrl && onEditImage(task.imageUrl)}
              />
            ) : null}
            {isVisionTask && hasOutputText ? (
              <IconAction
                label={t("tasks.actions.useAsPrompt")}
                icon={Sparkles}
                onClick={() => task.outputText && onUseAsPrompt(task.outputText)}
              />
            ) : null}
            {!isVisionTask ? (
              <IconAction label={t("tasks.actions.reuseParams")} icon={SlidersHorizontal} onClick={() => onReuseParams(task)} />
            ) : null}

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("tasks.actions.more")}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("tasks.actions.more")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                {isVisionTask ? (
                  <>
                    <DropdownMenuItem disabled={!hasOutputText} onSelect={() => void handleCopyOutputText()}>
                      <Copy aria-hidden="true" />
                      {t("tasks.actions.copyOutput")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!hasOutputText} onSelect={() => handleDownloadOutputText()}>
                      <FileDown aria-hidden="true" />
                      {t("tasks.actions.downloadText")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled={!hasImage} onSelect={() => void handleCopyImage()}>
                    <Link aria-hidden="true" />
                    {t("tasks.actions.copyImageUrl")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void handleCopyPrompt()}>
                  <Copy aria-hidden="true" />
                  {t("tasks.actions.copyPrompt")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!hasDebug} onSelect={() => void handleCopyDebug()}>
                  <Bug aria-hidden="true" />
                  {t("tasks.actions.copyDebug")}
                </DropdownMenuItem>
                {!isVisionTask ? (
                  <DropdownMenuItem disabled={!hasStoredImage} onSelect={() => handleClearImage()}>
                    <ImageOff aria-hidden="true" />
                    {t("tasks.actions.deleteImageCache")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
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
        </div>
      </div>
    </article>
  );
});
