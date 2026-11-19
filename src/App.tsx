import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FilePen, Layers, PlugZap, ScanEye, Sparkles, Trash2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GenerationPanel } from "./components/GenerationPanel";
import { Header } from "./components/Header";
import { ImageLibrary } from "./components/ImageLibrary";
import { ImagePreviewModal, type PreviewState } from "./components/ImagePreviewModal";
import { Notice } from "./components/Notice";
import { SettingsPanel } from "./components/SettingsPanel";
import { TaskQueue } from "./components/TaskQueue";
import { VisionPanel } from "./components/VisionPanel";
import { BatchRenamePanel } from "./components/BatchRenamePanel";
import { BatchGenerationPanel } from "./components/BatchGenerationPanel";
import { StorageHealthBanner } from "./components/StorageHealthBanner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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


import { useImageTasks } from "./hooks/useImageTasks";
import { useSettings } from "./hooks/useSettings";
import { toFriendlyError } from "./lib/errors";
import { parseAdvancedJson } from "./lib/parseAdvancedJson";
import { stripGeminiSizeArtifacts } from "./lib/imageSizing";
import { DEFAULT_BATCH_FORM, DEFAULT_FORM, DEFAULT_VISION_FORM, loadBatchPrompts, saveBatchPrompts } from "./lib/storage";
import { modelRequiresStrictPng, prepareInputImage, toInputImageFile } from "./lib/imageInput";
import { getCachedInputs } from "./lib/imageCache";
import { stripInternalParams } from "./api/requestShaping";
import { createBatchId, parsePromptList } from "./lib/promptList";
import { downloadBatchZip, getTaskBatchId } from "./lib/batchExport";
import type { AppSettings, BatchFormState, GenerateFormState, ImageTask, InputImageFile, ReuseParamsPayload, VisionFormState } from "./types";


function validateRequest(
  settings: AppSettings,
  form: GenerateFormState,
  messages: {
    apiKeyRequired: string;
    apiBaseUrlRequired: string;
    modelRequired: string;
    promptRequired: string;
  },
) {
  if (!settings.apiKey.trim()) {
    throw new Error(messages.apiKeyRequired);
  }

  if (!settings.baseUrl.trim()) {
    throw new Error(messages.apiBaseUrlRequired);
  }

  if (!settings.model.trim()) {
    throw new Error(messages.modelRequired);
  }

  if (!form.prompt.trim()) {
    throw new Error(messages.promptRequired);
  }
}

function normalizeForm(form: GenerateFormState): GenerateFormState {
  return {
    ...form,
    prompt: form.prompt.trim(),
    count: Math.max(1, Math.floor(Number.isFinite(form.count) ? form.count : 1)),
    size: form.size.trim() || "1024x1024",
  };
}

function validateVisionRequest(
  settings: AppSettings,
  form: VisionFormState,
  messages: {
    apiKeyRequired: string;
    apiBaseUrlRequired: string;
    visionModelRequired: string;
    promptRequired: string;
    imageRequired: string;
  },
) {
  if (!settings.apiKey.trim()) {
    throw new Error(messages.apiKeyRequired);
  }

  if (!settings.baseUrl.trim()) {
    throw new Error(messages.apiBaseUrlRequired);
  }

  if (!settings.visionModel.trim()) {
    throw new Error(messages.visionModelRequired);
  }

  if (!form.prompt.trim()) {
    throw new Error(messages.promptRequired);
  }

  if (form.inputImages.length === 0) {
    throw new Error(messages.imageRequired);
  }
}

type WorkspacePanel = "tasks" | "library";
type WorkspaceMode = "generate" | "vision" | "rename" | "batch";

const MODE_ICONS: Record<WorkspaceMode, LucideIcon> = {
  generate: Sparkles,
  vision: ScanEye,
  batch: Layers,
  rename: FilePen,
};

/** Build an {@link InputImageFile} from a File with a fresh object URL. */
function makeInputImageFile(file: File, width = 0, height = 0): InputImageFile {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    width,
    height,
  };
}

export default function App() {
  const { t } = useTranslation();
  const { settings, setSettings, resetSettings } = useSettings();
  const [form, setForm] = useState<GenerateFormState>(DEFAULT_FORM);
  const [visionForm, setVisionForm] = useState<VisionFormState>(DEFAULT_VISION_FORM);
  const [batchForm, setBatchForm] = useState<BatchFormState>(() => ({
    ...DEFAULT_BATCH_FORM,
    promptsText: loadBatchPrompts(),
  }));
  const [formError, setFormError] = useState("");
  const [visionError, setVisionError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("openai-image-webui:current-batch-id");
    } catch {
      return null;
    }
  });
  const [isExportingBatch, setIsExportingBatch] = useState(false);

  useEffect(() => {
    try {
      if (currentBatchId) {
        localStorage.setItem("openai-image-webui:current-batch-id", currentBatchId);
      } else {
        localStorage.removeItem("openai-image-webui:current-batch-id");
      }
    } catch {
      // Ignore localStorage failures.
    }
  }, [currentBatchId]);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("tasks");
  const [activeMode, setActiveMode] = useState<WorkspaceMode>("generate");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // On mobile the output sits far below the form, and on desktop a long task list can scroll it away.
  const showOutput = useCallback(() => {
    setActivePanel("tasks");
    requestAnimationFrame(() => {
      const top = outputRef.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight / 2)) {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  const {
    tasks,
    cacheStats,
    addTasks,
    addVisionTask,
    addBatchTasks,
    retryBatchErrors,
    retryTask,

    cancelTask,
    removeTask,
    clearTaskImage,
    clearCachedImages,
    clearTasks,
    getPendingInputs,
  } = useImageTasks(settings);


  const openPreview = useCallback((url: string, gallery: string[] = []) => {
    const index = gallery.indexOf(url);
    setPreview(index >= 0 ? { urls: gallery, index } : { urls: [url], index: 0 });
  }, []);
  const navigatePreview = useCallback((index: number) => {
    setPreview((current) => (current ? { ...current, index } : current));
  }, []);
  const closePreview = useCallback(() => setPreview(null), []);

  const activeTaskCount = tasks.filter(
    (task) => task.status === "pending" || task.status === "running",
  ).length;

  // These are passed to memo()-wrapped panels, so they must be stable —
  // otherwise every App render defeats the memoization entirely.
  const updateForm = useCallback((next: Partial<GenerateFormState>) => {
    setForm((current) => ({ ...current, ...next }));
  }, []);

  const updateVisionForm = useCallback((next: Partial<VisionFormState>) => {
    setVisionForm((current) => ({ ...current, ...next }));
  }, []);

  const updateBatchForm = useCallback((next: Partial<BatchFormState>) => {
    setBatchForm((current) => {
      const merged = { ...current, ...next };
      if (typeof next.promptsText === "string") {
        saveBatchPrompts(next.promptsText);
      }
      return merged;
    });
  }, []);

const handleReuseParams = useCallback((payload: ReuseParamsPayload) => {
    // Gemini models store auto-derived aspect_ratio / image_size in
    // extraParams and an auto-appended "--ar X:Y" in the prompt. Restoring
    // them verbatim locks the size — subsequent form.size changes get
    // ignored by buildCompatibleImageRequest (the "size changes have no effect" bug). Strip
    // them here so form.size stays the single source of truth. No-op for
    // non-Gemini models.
    // Internal keys (_batchId / _batchIndex) must not follow into the generate
    // form, or the new task gets counted as part of the old batch.
    const { prompt: cleanPrompt, extraParams: cleanExtra } = stripGeminiSizeArtifacts(
      payload.model,
      payload.prompt,
      payload.extraParams && stripInternalParams(payload.extraParams),
    );

    console.log("[reuseParams] handleReuseParams", {
      model: payload.model,
      inputImageCount: payload.inputImages?.length ?? 0,
      hasMask: !!payload.maskImage,
      inputImagesLost: payload.inputImagesLost,
      strippedGeminiArtifacts: cleanPrompt !== payload.prompt || cleanExtra !== payload.extraParams,
    });

    // Update settings (model + responseFormat)
    setSettings({
      model: payload.model,
      responseFormat: payload.responseFormat,
    });

// Update form (prompt + size + advancedJson + inputImages + maskImage).
    // The functional form lets us revoke the object URLs of the images we are
    // replacing — otherwise repeated "reuse params" leaks a blob every time.
    setForm((current) => {
      const nextImages = payload.inputImages ?? [];
      const nextMask = payload.maskImage ?? null;
      const keptUrls = new Set(nextImages.map((image) => image.previewUrl));

      if (nextMask) {
        keptUrls.add(nextMask.previewUrl);
      }

      for (const image of current.inputImages) {
        if (!keptUrls.has(image.previewUrl)) {
          URL.revokeObjectURL(image.previewUrl);
        }
      }

      if (current.maskImage && !keptUrls.has(current.maskImage.previewUrl)) {
        URL.revokeObjectURL(current.maskImage.previewUrl);
      }

      return {
        prompt: cleanPrompt,
        count: 1,
        size: payload.size,
        advancedJson: cleanExtra && Object.keys(cleanExtra).length > 0
          ? JSON.stringify(cleanExtra, null, 2)
          : "",
        inputImages: nextImages,
        maskImage: nextMask,
      };
    });

    // Switch back to the generate workspace so the applied params are
    // actually visible — the form lives behind the mode switch.
    setActiveMode("generate");
    setActivePanel("tasks");
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("prompt")?.focus({ preventScroll: true }));

    // Show toast
    if (payload.inputImagesLost) {
      toast.warning(t("tasks.messages.paramsAppliedInputsLost"));
    } else {
      toast.success(t("tasks.messages.paramsApplied"));
    }
  }, [setSettings, t]);

  /**
   * Build a ReuseParamsPayload from an ImageTask, checking in-memory inputs.
   * Async because recovered File blobs need decoding to recover their real
   * dimensions — GenerationPanel uses those for the native-resolution button
   * and for mask size validation.
   */
  const buildReusePayloadFromTask = useCallback(async (task: ImageTask): Promise<ReuseParamsPayload> => {
    const isEdit = task.mode === "edit";
    const memoryInputs = getPendingInputs(task.id);
    // In-memory inputs are dropped once a task succeeds; the persisted copy
    // stored with the cached result survives that and page reloads.
    const pending = isEdit && !memoryInputs?.images.length
      ? await getCachedInputs(task.id).catch(() => null)
      : memoryInputs;
    const hasInputs = isEdit && pending && pending.images.length > 0;

    // The generate and batch forms both keep their inputImages after a
    // successful submit (so the user can tweak & re-submit). The in-memory
    // File blobs held in pendingInputs are released once the task succeeds,
    // so when reusing an edit task whose blobs are gone, fall back to the
    // form that originally supplied the images before declaring them "lost".
    // Batch tasks were created from the batch form; single edits from the
    // generate form. In the common "just uploaded, just generated, now
    // reuse" flow the images are still right there - no reason to tell the
    // user they're gone.
    const isBatchTask = !!getTaskBatchId(task);
    const fallbackSource = isBatchTask ? batchForm.inputImages : form.inputImages;
    const fallbackAvailable = isEdit && !hasInputs && fallbackSource.length > 0;

    // Only truly lost when there are neither in-memory inputs nor a form
    // fallback.
    const inputImagesLost = isEdit && !hasInputs && !fallbackAvailable;

    console.log("[reuseParams] buildReusePayloadFromTask", {
      taskId: task.id,
      taskMode: task.mode,
      taskStatus: task.status,
      hasPendingInputs: !!pending,
      pendingImageCount: pending?.images.length ?? 0,
      isBatchTask,
      fallbackImageCount: fallbackSource.length,
      hasFormMask: !!form.maskImage,
      hasInputs,
      fallbackAvailable,
      inputImagesLost,
    });

    let inputImages: InputImageFile[] | undefined;
    let maskImage: InputImageFile | null | undefined;

    if (hasInputs && pending) {
      inputImages = await Promise.all(pending.images.map((file: File) => toInputImageFile(file)));
      maskImage = pending.mask ? await toInputImageFile(pending.mask) : null;
    } else if (fallbackAvailable) {
      if (isBatchTask) {
        // The batch form's images are about to move into the generate form.
        // Clone them with fresh object URLs so they don't share previewUrl
        // lifetime with the batch form - revoking one when removed from the
        // generate form must not break the batch form's copy.
        inputImages = fallbackSource.map((item) =>
          makeInputImageFile(item.file, item.width, item.height),
        );
        maskImage = null; // batch tasks never carry a mask
      } else {
        // Reuse the generate form's existing InputImageFile entries as-is -
        // their previewUrls are already valid, and they stay in the same
        // form, so no need to mint new object URLs (which would also leak
        // the old ones).
        inputImages = form.inputImages;
        maskImage = form.maskImage;
      }
    }

    return {
      model: task.model,
      prompt: task.prompt,
      size: task.size,
      responseFormat: task.responseFormat,
      extraParams: task.extraParams,
      inputImages,
      maskImage,
      inputImagesLost,
    };
  }, [batchForm.inputImages, form.inputImages, form.maskImage, getPendingInputs]);

  const handleReuseTask = useCallback(
    (task: ImageTask) => {
      void buildReusePayloadFromTask(task).then(handleReuseParams);
    },
    [buildReusePayloadFromTask, handleReuseParams],
  );

  /** Load a generated image into the generate form as the edit source. */
  const handleEditImage = useCallback(async (imageUrl: string) => {
    setActiveMode("generate");
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const blob = await (await fetch(imageUrl)).blob();
      const type = blob.type || "image/png";
      const image = await prepareInputImage(
        new File([blob], `edit-source.${type.split("/")[1] || "png"}`, { type }),
        { strictPngOnly: modelRequiresStrictPng(settings.model) },
      );

      setForm((current) => {
        for (const item of current.inputImages) URL.revokeObjectURL(item.previewUrl);
        if (current.maskImage) URL.revokeObjectURL(current.maskImage.previewUrl);
        return {
          ...current,
          inputImages: [image],
          maskImage: null,
          size: `${image.width}x${image.height}`,
        };
      });
      toast.success(t("tasks.messages.editImageLoaded"));
    } catch (error) {
      setFormError(
        toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      );
    }
  }, [settings.model, t]);

  const handleGenerate = useCallback(() => {
    setFormError("");

    try {
      const normalizedForm = normalizeForm(form);
      validateRequest(settings, normalizedForm, {
        apiKeyRequired: t("errors.apiKeyRequired"),
        apiBaseUrlRequired: t("errors.apiBaseUrlRequired"),
        modelRequired: t("errors.modelRequired"),
        promptRequired: t("errors.promptRequired"),
      });
      const extraParams = parseAdvancedJson(normalizedForm.advancedJson, {
        invalidJson: t("errors.advancedJsonInvalid"),
        mustBeObject: t("errors.advancedJsonObject"),
      });
      addTasks(normalizedForm, extraParams);
      showOutput();
      // Keep inputImages/maskImage in the form — user may want to tweak the
      // prompt and re-submit. Revoking their object URLs here would break
      // the in-flight task's preview data too. They get cleared when the
      // user explicitly removes them.
      setForm((current) => ({ ...current, count: normalizedForm.count, size: normalizedForm.size }));

    } catch (error) {
      setFormError(
        toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      );
    }
  }, [addTasks, form, settings, showOutput, t]);

  const handleAnalyzeImages = useCallback(() => {
    setVisionError("");

    try {
      const normalizedForm = {
        ...visionForm,
        prompt: visionForm.prompt.trim(),
      };
      validateVisionRequest(settings, normalizedForm, {
        apiKeyRequired: t("errors.apiKeyRequired"),
        apiBaseUrlRequired: t("errors.apiBaseUrlRequired"),
        visionModelRequired: t("errors.visionModelRequired"),
        promptRequired: t("errors.promptRequired"),
        imageRequired: t("errors.visionImageRequired"),
      });
      const extraParams = parseAdvancedJson(normalizedForm.advancedJson, {
        invalidJson: t("errors.advancedJsonInvalid"),
        mustBeObject: t("errors.advancedJsonObject"),
      });
      addVisionTask(normalizedForm, extraParams);
      showOutput();
      setVisionForm((current) => ({ ...current, prompt: normalizedForm.prompt }));
    } catch (error) {
      setVisionError(
        toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      );
    }
  }, [addVisionTask, settings, showOutput, t, visionForm]);

  const handleBatchGenerate = useCallback(() => {
    setBatchError("");

    try {
      if (!settings.apiKey.trim()) throw new Error(t("errors.apiKeyRequired"));
      if (!settings.baseUrl.trim()) throw new Error(t("errors.apiBaseUrlRequired"));
      if (!settings.model.trim()) throw new Error(t("errors.modelRequired"));

      const parsed = parsePromptList(batchForm.promptsText);
      if (parsed.prompts.length === 0) {
        throw new Error(t("errors.batchPromptsRequired"));
      }

      const extraParams = parseAdvancedJson(batchForm.advancedJson, {
        invalidJson: t("errors.advancedJsonInvalid"),
        mustBeObject: t("errors.advancedJsonObject"),
      });

      const batchId = createBatchId();
      addBatchTasks({
        prompts: parsed.prompts,
        inputImages: batchForm.inputImages,
        size: batchForm.size.trim() || "1024x1024",
        countPerPrompt: Math.max(1, Math.floor(batchForm.countPerPrompt || 1)),
        extraParams,
        batchId,
      });
      setCurrentBatchId(batchId);
      showOutput();
    } catch (error) {
      setBatchError(
        toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      );
    }
  }, [addBatchTasks, batchForm, settings, showOutput, t]);

  const handleRetryBatchErrors = useCallback(() => {
    if (!currentBatchId) return;
    const restoreFiles = batchForm.inputImages.map((item) => item.file);
    retryBatchErrors(currentBatchId, restoreFiles.length > 0 ? restoreFiles : undefined);
  }, [batchForm.inputImages, currentBatchId, retryBatchErrors]);

  const handleExportBatch = useCallback(async () => {
    if (!currentBatchId) return;
    setIsExportingBatch(true);
    try {
      const result = await downloadBatchZip(tasks, currentBatchId);
      toast.success(t("batch.actions.exportDone", { exported: result.exported, missing: result.missing }));
    } catch (error) {
      setBatchError(
        toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      );
    } finally {
      setIsExportingBatch(false);
    }
  }, [currentBatchId, t, tasks]);

  const handleExportBatchClick = useCallback(() => {
    void handleExportBatch();
  }, [handleExportBatch]);

  const isConnected = !!settings.apiKey.trim() && !!settings.baseUrl.trim();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#prompt"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("app.skipToForm")}
      </a>
      <a
        href="#results"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("app.skipToResults")}
      </a>

      <Header
        baseUrl={settings.baseUrl}
        model={settings.model}
        isConnected={isConnected}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <StorageHealthBanner />

      <div className="flex-1 lg:grid lg:grid-cols-[minmax(380px,420px)_1fr]">
        {/* Workbench: the active input form. Sticky on desktop so the submit button never scrolls away. */}
        <aside className="border-b bg-card lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:flex-col lg:border-b-0 lg:border-r">
          <Tabs
            value={activeMode}
            onValueChange={(value) => setActiveMode(value as WorkspaceMode)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b px-4 py-3">
              <TabsList className="grid h-auto w-full grid-cols-4 p-1">
                {(["generate", "vision", "batch", "rename"] as const).map((mode) => {
                  const Icon = MODE_ICONS[mode];
                  return (
                    <TabsTrigger
                      key={mode}
                      value={mode}
                      title={t(`workspace.modeDescriptions.${mode}`)}
                      className="h-auto flex-col gap-1 whitespace-normal px-1 py-1.5 text-center text-xs leading-tight"
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span>{t(`workspace.modes.${mode}`)}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              {!isConnected ? (
                <div className="px-4 pt-4">
                  <Notice
                    variant="warning"
                    title={t("app.setup.title")}
                    action={
                      <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                        <PlugZap aria-hidden="true" />
                        {t("app.setup.action")}
                      </Button>
                    }
                  >
                    {t("app.setup.body")}
                  </Notice>
                </div>
              ) : null}

              <TabsContent value="generate" className="mt-0 h-full focus-visible:ring-inset focus-visible:ring-offset-0">
                <GenerationPanel form={form} error={formError} model={settings.model} onChange={updateForm} onSubmit={handleGenerate} />
              </TabsContent>
              <TabsContent value="vision" className="mt-0 h-full focus-visible:ring-inset focus-visible:ring-offset-0">
                <VisionPanel form={visionForm} error={visionError} visionModel={settings.visionModel} onChange={updateVisionForm} onSubmit={handleAnalyzeImages} />
              </TabsContent>
              <TabsContent value="batch" className="mt-0 h-full focus-visible:ring-inset focus-visible:ring-offset-0">
                <BatchGenerationPanel
                  form={batchForm}
                  error={batchError}
                  model={settings.model}
                  tasks={tasks}
                  currentBatchId={currentBatchId}
                  isExporting={isExportingBatch}
                  onChange={updateBatchForm}
                  onSubmit={handleBatchGenerate}
                  onRetryBatchErrors={handleRetryBatchErrors}
                  onExportBatch={handleExportBatchClick}
                />
              </TabsContent>
              <TabsContent value="rename" className="mt-0 h-full focus-visible:ring-inset focus-visible:ring-offset-0">
                <BatchRenamePanel settings={settings} />
              </TabsContent>
            </div>
          </Tabs>
        </aside>

        {/* Output: tasks and the persistent image library */}
        <main id="results" ref={outputRef} tabIndex={-1} className="min-w-0 scroll-mt-16 focus:outline-none">
          <Tabs value={activePanel} onValueChange={(value) => setActivePanel(value as WorkspacePanel)}>
            <div className="sticky top-14 z-30 flex items-center justify-between gap-3 border-b bg-background/85 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
              <TabsList>
                {(["tasks", "library"] as const).map((panel) => {
                  const badge = panel === "tasks" ? activeTaskCount : cacheStats.count;
                  return (
                    <TabsTrigger key={panel} value={panel} className="group gap-2">
                      {t(`workspace.tabs.${panel}`)}
                      {badge > 0 ? (
                        <span className="rounded bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground group-data-[state=active]:bg-foreground/10">
                          {badge}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {activePanel === "tasks" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={tasks.length === 0} className="text-muted-foreground hover:text-destructive">
                      <Trash2 aria-hidden="true" />
                      <span className="hidden sm:inline">{t("header.clearTasks")}</span>
                      <span className="sr-only sm:hidden">{t("header.clearTasks")}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("app.clearTasks.title")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("header.clearTasksConfirm")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={clearTasks}
                      >
                        {t("app.clearTasks.confirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>

            <div className="mx-auto max-w-[1400px] p-4 md:p-6">
              <TabsContent value="tasks" className="mt-0">
                <TaskQueue
                  tasks={tasks}
                  onPreview={openPreview}
                  onRetry={retryTask}
                  onCancel={cancelTask}
                  onRemove={removeTask}
                  onClearTaskImage={clearTaskImage}
                  onReuseParams={handleReuseTask}
                  onEditImage={handleEditImage}
                />
              </TabsContent>
              <TabsContent value="library" className="mt-0">
                <ImageLibrary
                  stats={cacheStats}
                  onPreview={openPreview}
                  onDeleteImage={clearTaskImage}
                  onReuseParams={handleReuseParams}
                  onEditImage={handleEditImage}
                  onClearImageCache={clearCachedImages}
                />
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        onReset={resetSettings}
      />
      <ImagePreviewModal preview={preview} onNavigate={navigatePreview} onClose={closePreview} />
    </div>
  );
}
