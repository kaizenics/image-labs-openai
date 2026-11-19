import { useMemo, useRef, useState, memo, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BatchFormState, ImageTask, InputImageFile } from "../types";
import {
  InputImageError,
  modelLikelySupportsMultipleImages,
  modelRequiresStrictPng,
  prepareInputImage,
} from "../lib/imageInput";
import { parsePromptList, readPromptListFile } from "../lib/promptList";
import { batchProgress, tasksOfBatch } from "../lib/batchExport";
import { Notice } from "./Notice";
import { ImageDropzone } from "./ImageDropzone";
import { Field } from "./Field";
import { Chip } from "./Chip";
import { Disclosure } from "./Disclosure";
import { Download, FileUp, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { MOD_KEY_LABEL, submitOnModEnter } from "@/lib/keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

interface BatchGenerationPanelProps {
  form: BatchFormState;
  error: string;
  model?: string;
  tasks: ImageTask[];
  currentBatchId: string | null;
  isExporting?: boolean;
  onChange: (next: Partial<BatchFormState>) => void;
  onSubmit: () => void;
  onRetryBatchErrors: () => void;
  onExportBatch: () => void;
}

const COMMON_SIZES = ["512x512", "1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"];
const PROMPT_FILE_ACCEPT = ".txt,.md,.csv,text/plain,text/markdown,text/csv";

export const BatchGenerationPanel = memo(function BatchGenerationPanel({
  form,
  error,
  model,
  tasks,
  currentBatchId,
  isExporting,
  onChange,
  onSubmit,
  onRetryBatchErrors,
  onExportBatch,
}: BatchGenerationPanelProps) {
  const { t } = useTranslation();
  const [inputImageError, setInputImageError] = useState("");
  const promptFileInputRef = useRef<HTMLInputElement>(null);

  const strictPng = modelRequiresStrictPng(model ?? "");
  const supportsMultiImage = modelLikelySupportsMultipleImages(model ?? "");
  const isEditMode = form.inputImages.length > 0;

  const parsed = useMemo(() => parsePromptList(form.promptsText), [form.promptsText]);
  const totalTasksToCreate = parsed.prompts.length * Math.max(1, Math.floor(form.countPerPrompt || 1));

  const progress = useMemo(
    () => (currentBatchId ? batchProgress(tasks, currentBatchId) : null),
    [tasks, currentBatchId],
  );
  const batchTasks = useMemo(
    () => (currentBatchId ? tasksOfBatch(tasks, currentBatchId) : []),
    [tasks, currentBatchId],
  );
  const successCount = progress?.success ?? 0;
  const errorCount = progress?.error ?? 0;
  const finishedCount = progress
    ? progress.success + progress.error + progress.cancelled
    : 0;
  const percent =
    progress && progress.total > 0
      ? Math.round((finishedCount / progress.total) * 100)
      : 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  async function handleAddInputImages(files: FileList | File[]) {
    setInputImageError("");
    const list = Array.from(files);
    const prepared: InputImageFile[] = [];
    for (const file of list) {
      try {
        const item = await prepareInputImage(file, { strictPngOnly: strictPng });
        prepared.push(item);
      } catch (err) {
        const reason = err instanceof InputImageError ? err.message : String(err);
        setInputImageError(t("batch.inputImages.title") + ": " + reason);
        prepared.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return;
      }
    }
    if (prepared.length === 0) return;
    onChange({ inputImages: [...form.inputImages, ...prepared] });
  }

  function removeInputImage(id: string) {
    const next = form.inputImages.filter((item) => {
      if (item.id === id) {
        URL.revokeObjectURL(item.previewUrl);
        return false;
      }
      return true;
    });
    onChange({ inputImages: next });
  }

  async function handlePromptFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await readPromptListFile(file);
      onChange({ promptsText: text });
    } catch (err) {
      setInputImageError(
        t("batch.prompts.importFailed", { reason: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  const acceptMime = strictPng ? "image/png" : "image/png,image/jpeg,image/webp";
  const showMultiImageWarning =
    form.inputImages.length > 1 && !!model && !supportsMultiImage;

  return (
    <form className="flex min-h-full flex-col" onSubmit={handleSubmit} aria-labelledby="batch-heading" noValidate>
      <div className="flex-1 space-y-5 p-4">
        <div>
          <h2 id="batch-heading" className="sr-only">{t("batch.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("batch.subtitle")}</p>
        </div>

        {/* Current batch progress */}
        {currentBatchId && progress ? (
          <section className="grid gap-3 rounded-lg border p-3" aria-labelledby="batch-progress-heading">
            <div className="flex items-center justify-between gap-2">
              <h3 id="batch-progress-heading" className="text-sm font-medium">{t("batch.progress.title")}</h3>
              <span className="truncate font-mono text-xs tabular-nums text-muted-foreground">{currentBatchId}</span>
            </div>
            <div className="grid gap-1.5">
              <Progress
                value={percent}
                aria-label={t("batch.progress.title")}
                className="h-1.5 bg-muted [&>div]:bg-brand"
              />
              <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {t("batch.progress.summary", {
                  done: finishedCount,
                  total: progress.total,
                  running: progress.running,
                  error: progress.error,
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetryBatchErrors}
                disabled={errorCount === 0}
              >
                <RotateCcw aria-hidden="true" />
                {t("batch.actions.retryErrors", { count: errorCount })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportBatch}
                disabled={successCount === 0 || Boolean(isExporting)}
              >
                {isExporting ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {isExporting
                  ? t("batch.actions.exporting")
                  : t("batch.actions.exportZip", { count: successCount })}
              </Button>
            </div>
            {batchTasks.length > 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">{t("batch.progress.tasksHint")}</p>
            ) : null}
          </section>
        ) : null}

        {/* Prompt list */}
        <Field
          label={t("batch.prompts.title")}
          hint={t("batch.prompts.parsedSummary", {
            count: parsed.prompts.length,
            comments: parsed.commentLines,
            empty: parsed.emptyLines,
          })}
          action={
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => promptFileInputRef.current?.click()}
              >
                <FileUp aria-hidden="true" />
                {t("batch.prompts.importButton")}
              </Button>
              <input
                ref={promptFileInputRef}
                type="file"
                accept={PROMPT_FILE_ACCEPT}
                hidden
                onChange={handlePromptFileImport}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => onChange({ promptsText: "" })}
                disabled={!form.promptsText}
              >
                {t("batch.prompts.clearButton")}
              </Button>
            </div>
          }
        >
          <Textarea
            className="min-h-40 resize-y font-mono text-xs leading-relaxed"
            spellCheck={false}
            placeholder={t("batch.prompts.placeholder")}
            value={form.promptsText}
            onChange={(event) => onChange({ promptsText: event.target.value })}
            onKeyDown={submitOnModEnter}
          />
        </Field>

        {/* Shared reference images (optional) */}
        <ImageDropzone
          images={form.inputImages}
          onAdd={handleAddInputImages}
          onRemove={removeInputImage}
          title={t("batch.inputImages.title")}
          hint={t("batch.inputImages.hint")}
          addButtonLabel={t("batch.inputImages.addButton")}
          removeLabel={t("batch.inputImages.remove")}
          accept={acceptMime}
          badge={isEditMode ? t("batch.inputImages.editModeBadge") : undefined}
          warning={showMultiImageWarning ? t("batch.inputImages.multipleImagesWarning") : undefined}
          error={inputImageError || undefined}
        />

        <div className="grid gap-2">
          <Field label={t("batch.size")}>
            <Input
              className="font-mono text-xs"
              spellCheck={false}
              value={form.size}
              placeholder="1024x1024"
              onChange={(event) => onChange({ size: event.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_SIZES.map((s) => (
              <Chip key={s} active={form.size.trim() === s} onClick={() => onChange({ size: s })}>
                {s}
              </Chip>
            ))}
          </div>
        </div>

        <Field label={t("batch.countPerPrompt")} hint={t("batch.countPerPromptHint")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            className="w-24 tabular-nums"
            value={form.countPerPrompt}
            onChange={(event) => onChange({ countPerPrompt: Number(event.target.value) })}
          />
        </Field>

        <Disclosure
          title={t("batch.advancedJsonParams")}
          summary={form.advancedJson.trim() ? "{…}" : undefined}
        >
          <Field label={t("batch.advancedJsonParams")} className="[&>div:first-child]:sr-only">
            <Textarea
              className="min-h-24 resize-y font-mono text-xs"
              spellCheck={false}
              placeholder={'{\n  "quality": "high"\n}'}
              value={form.advancedJson}
              onChange={(event) => onChange({ advancedJson: event.target.value })}
            />
          </Field>
        </Disclosure>

        {error ? <Notice variant="error">{error}</Notice> : null}

        <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {t("batch.submitSummary", {
            prompts: parsed.prompts.length,
            count: Math.max(1, Math.floor(form.countPerPrompt || 1)),
            total: totalTasksToCreate,
          })}
        </p>
      </div>

      <div className="sticky bottom-0 z-10 flex items-end gap-2 border-t bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Button
          type="submit"
          variant="brand"
          className="h-9 flex-1"
          disabled={parsed.prompts.length === 0}
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          {isEditMode ? <Wand2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {isEditMode ? t("batch.startEdit") : t("batch.startGenerate")}
          <kbd className="ml-1 hidden rounded border border-brand-foreground/30 px-1 font-mono text-[10px] font-normal opacity-80 sm:inline">
            {MOD_KEY_LABEL} ↵
          </kbd>
        </Button>
      </div>
    </form>
  );
});
