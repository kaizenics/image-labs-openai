import { useCallback, useRef, useState, memo, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileCode,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Square,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { Notice } from "./Notice";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import type { RenameItem } from "../lib/batchRename";
import type { NamingMode } from "../lib/batchRename";
import {
  buildFinalName,
  callAIForName,
  compressImageForAI,
  downloadRenamedZip,
  downloadScriptZip,
  generateThumbnailUrl,
} from "../lib/batchRename";

interface BatchRenamePanelProps {
  settings: AppSettings;
}

const ACCEPTED_FORMATS = ".jpg,.jpeg,.png,.webp,.tga,.bmp";


export const BatchRenamePanel = memo(function BatchRenamePanel({ settings }: BatchRenamePanelProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RenameItem[]>([]);
  const [namingMode, setNamingMode] = useState<NamingMode>("compact");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) =>
      /\.(jpe?g|png|webp|tga|bmp)$/i.test(f.name),
    );
    if (fileArray.length === 0) return;

    const newItems: RenameItem[] = await Promise.all(
      fileArray.map(async (file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let thumbnailUrl = "";
        try {
          thumbnailUrl = await generateThumbnailUrl(file);
        } catch { /* ignore */ }
        return {
          id,
          originalName: file.name,
          newName: "",
          status: "pending" as const,
          thumbnailUrl,
          file,
        };
      }),
    );

    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles],
  );

  const startRename = useCallback(async () => {
    if (!settings.apiKey.trim() || !settings.baseUrl.trim() || !settings.visionModel.trim()) return;

    const pendingItems = items.filter((i) => i.status === "pending" || i.status === "error");
    if (pendingItems.length === 0) return;

    setIsProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    for (const [index, item] of pendingItems.entries()) {
      if (controller.signal.aborted) break;

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i)),
      );

      try {
        const compressed = await compressImageForAI(item.file);
        const aiName = await callAIForName({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.visionModel,
          imageBlob: compressed,
          namingMode,
          signal: controller.signal,
        });
        const finalName = buildFinalName(aiName, item.originalName, index + 1);

        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "done", newName: finalName } : i,
          ),
        );
      } catch (err) {
        if (controller.signal.aborted) break;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "error", error: err instanceof Error ? err.message : "Unknown error" }
              : i,
          ),
        );
      }
    }

    setIsProcessing(false);
    abortRef.current = null;
  }, [items, settings, namingMode]);

  const stopProcessing = useCallback(() => {
    abortRef.current?.abort();
    setIsProcessing(false);
  }, []);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setIsProcessing(false);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const doneCount = items.filter((i) => i.status === "done").length;
  const canDownload = doneCount > 0;

  const settingsOk = settings.apiKey.trim() && settings.baseUrl.trim() && settings.visionModel.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProcessing) void startRename();
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={handleSubmit} aria-labelledby="rename-heading" noValidate>
      <div className="flex-1 space-y-5 p-4">
        <div>
          <h2 id="rename-heading" className="sr-only">{t("batchRename.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("batchRename.subtitle")}</p>
        </div>

        {/* Drop zone */}
        <div
          className={cn(
            "rounded-md border border-dashed p-2 transition-colors",
            isDragging ? "border-brand bg-brand-soft" : "border-input",
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">
              <ImagePlus aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("batchRename.dropHint")}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{t("batchRename.formatHint")}</span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPTED_FORMATS}
            onChange={handleFileInput}
          />
        </div>

        {/* Naming mode toggle */}
        <div className="grid gap-1.5">
          <span id="rename-naming-mode" className="text-sm font-medium leading-none">
            {t("batchRename.namingMode")}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="justify-start"
            aria-labelledby="rename-naming-mode"
            aria-describedby="rename-naming-mode-hint"
            value={namingMode}
            onValueChange={(value) => {
              if (value) setNamingMode(value as NamingMode);
            }}
          >
            <ToggleGroupItem value="compact" className="px-3 text-xs data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background">
              {t("batchRename.modeCompact")}
            </ToggleGroupItem>
            <ToggleGroupItem value="descriptive" className="px-3 text-xs data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background">
              {t("batchRename.modeDescriptive")}
            </ToggleGroupItem>
          </ToggleGroup>
          <p id="rename-naming-mode-hint" className="font-mono text-xs text-muted-foreground">
            {namingMode === "compact"
              ? t("batchRename.modeCompactHint")
              : t("batchRename.modeDescriptiveHint")}
          </p>
        </div>

        {/* Validation hint */}
        {!settingsOk && items.length > 0 ? (
          <Notice variant="warning">{t("batchRename.settingsRequired")}</Notice>
        ) : null}

        {/* Item list */}
        {items.length > 0 ? (
          <div className="grid gap-2">
            <ScrollArea className="rounded-lg border [&>[data-radix-scroll-area-viewport]]:max-h-96">
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-2.5 py-2">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-sm border object-cover"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-sm border bg-muted text-muted-foreground">
                        <ImageIcon aria-hidden="true" className="size-4" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1 font-mono text-xs leading-5">
                      <p className="truncate text-muted-foreground" title={item.originalName}>
                        {item.originalName}
                      </p>
                      {item.newName ? (
                        <p className="flex min-w-0 items-center gap-1" title={item.newName}>
                          <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium text-foreground">{item.newName}</span>
                        </p>
                      ) : null}
                      {item.error ? (
                        <p className="truncate font-sans text-destructive" title={item.error}>
                          {item.error}
                        </p>
                      ) : null}
                    </div>

                    <span className="shrink-0">
                      {item.status === "pending" ? (
                        <Circle aria-hidden="true" className="size-4 text-muted-foreground" />
                      ) : null}
                      {item.status === "processing" ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin text-brand" />
                      ) : null}
                      {item.status === "done" ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                      ) : null}
                      {item.status === "error" ? (
                        <XCircle aria-hidden="true" className="size-4 text-destructive" />
                      ) : null}
                      <span className="sr-only">
                        {item.status === "pending" && t("batchRename.statusPending")}
                        {item.status === "processing" && t("batchRename.statusProcessing")}
                        {item.status === "done" && t("tasks.status.success")}
                        {item.status === "error" && t("tasks.status.error")}
                      </span>
                    </span>

                    {!isProcessing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground"
                        aria-label={`${t("batchRename.remove")}: ${item.originalName}`}
                        onClick={() => removeItem(item.id)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {t("batchRename.stats", { total: items.length, done: doneCount })}
            </p>
          </div>
        ) : null}

        {/* Secondary actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canDownload}
            onClick={() => downloadScriptZip(items)}
          >
            <FileCode aria-hidden="true" />
            {t("batchRename.downloadScript")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canDownload}
            onClick={() => downloadRenamedZip(items)}
          >
            <Download aria-hidden="true" />
            {t("batchRename.downloadZip")}
          </Button>
          {items.length > 0 && !isProcessing ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 aria-hidden="true" />
              {t("batchRename.clear")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex items-end gap-2 border-t bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {!isProcessing ? (
          <Button
            type="submit"
            variant="brand"
            className="h-9 flex-1"
            disabled={items.length === 0 || !settingsOk}
          >
            <Wand2 aria-hidden="true" />
            {t("batchRename.start")}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-9 flex-1" onClick={stopProcessing}>
            <Square aria-hidden="true" />
            {t("batchRename.stop")}
          </Button>
        )}
      </div>
    </form>
  );
});
