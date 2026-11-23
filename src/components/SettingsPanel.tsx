import { useEffect, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, EyeOff, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { isGeminiNative } from "../api/geminiProvider";
import { fetchModels, type ModelCapability, type ModelInfo } from "../api/openaiModels";
import { toFriendlyError } from "../lib/errors";
import type { AppSettings, ImageResponseFormat } from "../types";
import { BackupSection } from "./BackupSection";
import { Notice } from "./Notice";
import { Field } from "./Field";
import { ModelPicker, type ModelOption } from "./ModelPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const PROVIDER_PRESETS: Array<{
  name: string;
  descriptionKey: string;
  settings: Pick<AppSettings, "baseUrl" | "model" | "visionModel" | "responseFormat">;
}> = [
  {
    name: "OpenAI",
    descriptionKey: "settings.presets.openai.description",
    settings: {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-1.5",
      visionModel: "gpt-4.1-mini",
      responseFormat: "url",
    },
  },
  {
    name: "Google Gemini",
    descriptionKey: "settings.presets.gemini.description",
    settings: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash-image",
      visionModel: "gemini-2.5-flash",
      responseFormat: "b64_json",
    },
  },
];

// Native Gemini API models. The picker also accepts any custom id, or fetch the list from your key.
const GEMINI_IMAGE_MODEL_PRESETS: ModelOption[] = [
  { id: "gemini-3-pro-image-preview", note: "best quality" },
  { id: "gemini-2.5-flash-image", note: "fast" },
];
const GEMINI_VISION_MODEL_PRESETS: ModelOption[] = [
  { id: "gemini-2.5-pro" },
  { id: "gemini-2.5-flash" },
  { id: "gemini-2.5-flash-lite", note: "cheapest" },
];

// OpenAI Images API models (developers.openai.com, Nov 2026). Anything else goes through "Custom model".
const IMAGE_MODEL_PRESETS: ModelOption[] = [
  { id: "gpt-image-2", note: "newest" },
  { id: "gpt-image-1.5" },
  { id: "gpt-image-1" },
  { id: "gpt-image-1-mini", note: "cheapest" },
];

// Multimodal models that accept image input through /responses.
const VISION_MODEL_PRESETS: ModelOption[] = [
  { id: "gpt-5.5", note: "newest" },
  { id: "gpt-5" },
  { id: "gpt-5-mini" },
  { id: "gpt-5-nano", note: "cheapest" },
  { id: "gpt-4.1" },
  { id: "gpt-4.1-mini" },
  { id: "gpt-4o" },
  { id: "gpt-4o-mini" },
];

function fetchedOptions(list: ModelInfo[]): ModelOption[] {
  return list.map((item) => ({ id: item.id, note: item.ownedBy || undefined }));
}

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onChange: (next: Partial<AppSettings>) => void;
  onReset: () => void;
}

interface ModelsState {
  status: "idle" | "loading" | "success" | "error";
  list: ModelInfo[];
  error: string;
}

const INITIAL_MODELS_STATE: ModelsState = {
  status: "idle",
  list: [],
  error: "",
};

type ModelFilter = "all" | ModelCapability;

const MODEL_FILTER_OPTIONS: Array<{ value: ModelFilter; labelKey: string }> = [
  { value: "image", labelKey: "settings.models.filters.image" },
  { value: "non-image", labelKey: "settings.models.filters.non-image" },
  { value: "all", labelKey: "settings.models.filters.all" },
];

function trimSlash(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export const SettingsPanel = memo(function SettingsPanel({
  open,
  onOpenChange,
  settings,
  onChange,
  onReset,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const [modelsState, setModelsState] = useState<ModelsState>(INITIAL_MODELS_STATE);
  const [modelFilter, setModelFilter] = useState<ModelFilter>("image");
  const [showKey, setShowKey] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedKeyRef = useRef<string>("");

  // Reset the model suggestions whenever the credential pair changes,
  // so the user does not see stale results from a different provider.
  useEffect(() => {
    const currentKey = `${settings.baseUrl.trim()}::${settings.apiKey.trim()}`;
    if (lastFetchedKeyRef.current && lastFetchedKeyRef.current !== currentKey) {
      setModelsState(INITIAL_MODELS_STATE);
      lastFetchedKeyRef.current = "";
    }
  }, [settings.apiKey, settings.baseUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleFetchModels() {
    if (!settings.apiKey.trim()) {
      setModelsState({ status: "error", list: [], error: t("errors.apiKeyRequiredToFetchModels") });
      return;
    }

    if (!settings.baseUrl.trim()) {
      setModelsState({ status: "error", list: [], error: t("errors.apiBaseUrlRequiredToFetchModels") });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setModelsState({ status: "loading", list: [], error: "" });

    try {
      const list = await fetchModels({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        signal: controller.signal,
      });
      lastFetchedKeyRef.current = `${settings.baseUrl.trim()}::${settings.apiKey.trim()}`;
      setModelsState({ status: "success", list, error: "" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setModelsState({
        status: "error",
        list: [],
        error: toFriendlyError(error, {
          unknown: t("errors.unknown"),
          requestFailed: t("errors.requestFailed"),
        }),
      });
    }
  }

  const imageModels = modelsState.list.filter((item) => item.isImageModel);
  const filteredModels = modelsState.list.filter((item) => {
    if (modelFilter === "all") return true;
    return item.category === modelFilter;
  });
  const categoryCounts = MODEL_FILTER_OPTIONS.reduce<Record<ModelFilter, number>>(
    (counts, option) => {
      counts[option.value] = modelsState.list.filter((item) => {
        if (option.value === "all") return true;
        return item.category === option.value;
      }).length;
      return counts;
    },
    { all: 0, image: 0, "non-image": 0 },
  );

  const modelHint =
    modelsState.status === "success"
      ? t("settings.models.loaded", {
          total: modelsState.list.length,
          image: imageModels.length,
          shown: filteredModels.length,
        })
      : modelsState.status === "idle"
        ? t("settings.models.idle")
        : undefined;

  const activePresetUrl = trimSlash(settings.baseUrl);
  const pickerLabels = {
    presets: t("settings.models.openaiModels"),
    fetched: t("settings.models.endpointModels"),
    custom: t("settings.models.custom"),
    customPlaceholder: t("settings.models.customPlaceholder"),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-6 py-5 text-left">
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{t("app.settingsDescription")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("settings.providerPresets")}</legend>
            <div className="grid gap-2">
              {PROVIDER_PRESETS.map((preset) => {
                const isActive = activePresetUrl === trimSlash(preset.settings.baseUrl);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={isActive}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive ? "border-brand bg-brand-soft" : "hover:bg-accent",
                    )}
                    onClick={() => onChange(preset.settings)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{preset.name}</span>
                      <span className="block text-xs text-muted-foreground">{t(preset.descriptionKey)}</span>
                    </span>
                    {isActive ? <Check aria-hidden="true" className="size-4 shrink-0 text-brand" /> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{t("settings.presetsNote")}</p>
          </fieldset>

          <Separator />

          <div className="space-y-4">
            <Field label={t("settings.apiBaseUrl")}>
              <Input
                type="url"
                inputMode="url"
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                value={settings.baseUrl}
                onChange={(event) => onChange({ baseUrl: event.target.value })}
              />
            </Field>

            <Field
              label={t("settings.apiKey")}
              hint={t("settings.apiKeyNotice")}
              endAdornment={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label={showKey ? t("app.hideKey") : t("app.showKey")}
                  aria-pressed={showKey}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              }
            >
              <Input
                className="pr-10 font-mono"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                value={settings.apiKey}
                onChange={(event) => onChange({ apiKey: event.target.value })}
              />
            </Field>
          </div>

          <Separator />

          <div className="space-y-4">
            <Field
              label={t("settings.model")}
              hint={modelHint}
              error={modelsState.status === "error" ? modelsState.error : undefined}
              id="settings-image-model"
            >
              <ModelPicker
                id="settings-image-model"
                value={settings.model}
                onChange={(model) => onChange({ model })}
                presets={isGeminiNative(settings.baseUrl) ? GEMINI_IMAGE_MODEL_PRESETS : IMAGE_MODEL_PRESETS}
                fetched={fetchedOptions(filteredModels)}
                labels={pickerLabels}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Select value={modelFilter} onValueChange={(value) => setModelFilter(value as ModelFilter)}>
                <SelectTrigger className="h-8 w-auto min-w-[9rem] text-xs" aria-label={t("settings.model")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {modelsState.status === "success"
                        ? `${t(option.labelKey)} (${categoryCounts[option.value]})`
                        : t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFetchModels}
                disabled={modelsState.status === "loading"}
              >
                {modelsState.status === "loading" ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {modelsState.status === "loading" ? t("settings.models.fetching") : t("settings.models.fetchModels")}
              </Button>
            </div>

            <Field label={t("settings.visionModel")} hint={t("settings.visionModelHint")} id="settings-vision-model">
              <ModelPicker
                id="settings-vision-model"
                value={settings.visionModel}
                onChange={(visionModel) => onChange({ visionModel })}
                presets={isGeminiNative(settings.baseUrl) ? GEMINI_VISION_MODEL_PRESETS : VISION_MODEL_PRESETS}
                fetched={fetchedOptions(modelsState.list)}
                labels={pickerLabels}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.responseFormat")} id="settings-response-format">
                <Select
                  value={settings.responseFormat}
                  onValueChange={(value) => onChange({ responseFormat: value as ImageResponseFormat })}
                >
                  <SelectTrigger id="settings-response-format" className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="url" className="font-mono">url</SelectItem>
                    <SelectItem value="b64_json" className="font-mono">b64_json</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("settings.concurrency")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="tabular-nums"
                  min={1}
                  max={10}
                  value={settings.concurrency}
                  onChange={(event) => onChange({ concurrency: Number(event.target.value) })}
                />
              </Field>
            </div>
          </div>

          <Notice>{t("notice.cors")}</Notice>

          <BackupSection />
        </div>

        <SheetFooter className="flex-row justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden="true" />
            {t("settings.reset")}
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            {t("app.done")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
});
