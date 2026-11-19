import { useCallback, useEffect, useId, useMemo, useRef, useState, memo, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GenerateFormState, InputImageFile } from "../types";
import {
  assertMaskMatchesImage,
  InputImageError,
  modelLikelySupportsMultipleImages,
  modelRequiresStrictPng,
  prepareInputImage,
  toInputImageFile,
} from "../lib/imageInput";
import { getModelSizingProfile, getSizePresetGroupsForModel } from "../lib/imageSizing";
import { Brush, Image as ImageIcon, Info, Sparkles, Upload, Wand2, X } from "lucide-react";
import { MOD_KEY_LABEL, submitOnModEnter } from "@/lib/keyboard";
import { Notice } from "./Notice";
import { Field } from "./Field";
import { Chip } from "./Chip";
import { Disclosure } from "./Disclosure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ImageDropzone } from "./ImageDropzone";
import { MaskEditor } from "./MaskEditor";

const SIZE_STEP = 64;
const MIN_SIZE = 256;
const MAX_SIZE = 4096;
const DEFAULT_SIZE = 1024;
const RECENT_SIZE_LIMIT = 6;
const RECENT_SIZE_STORAGE_KEY = "openai-image-webui:recent-sizes";


interface GenerationPanelProps {
  form: GenerateFormState;
  error: string;
  /** Used to decide strict PNG enforcement and multi-image warnings. */
  model?: string;
  onChange: (next: Partial<GenerateFormState>) => void;
  onSubmit: () => void;
}

function roundToSizeStep(value: number, step = SIZE_STEP) {
  return Math.max(step, Math.round(value / step) * step);
}

function clampDimension(value: number, step = SIZE_STEP) {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, roundToSizeStep(value, step)));
}

/**
 * Clamp without rounding to SIZE_STEP — preserves exact pixel values
 * typed by the user or chosen from presets (e.g. 1280x720).
 */
function clampDimensionExact(value: number) {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
}

function normalizeSize(value: string) {
  const cleaned = value.trim().replace(/×/g, "x").replace(/\s+/g, "");

  if (!/^\d+x\d+$/i.test(cleaned)) {
    return "";
  }

  return cleaned.toLowerCase();
}

function parseSize(value: string) {
  const normalized = normalizeSize(value);
  if (!normalized) {
    return null;
  }

  const [widthPart, heightPart] = normalized.split("x");
  const width = Number(widthPart);
  const height = Number(heightPart);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: clampDimensionExact(width),
    height: clampDimensionExact(height),
  };
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }

  return x || 1;
}

function getRatioLabel(size: string) {
  const parsed = parseSize(size);

  if (!parsed) {
    return "";
  }

  const divisor = greatestCommonDivisor(parsed.width, parsed.height);
  return `${Math.round(parsed.width / divisor)}:${Math.round(parsed.height / divisor)}`;
}

function loadRecentSizes() {
  try {
    const raw = localStorage.getItem(RECENT_SIZE_STORAGE_KEY);
    if (!raw) {
      return [] as string[];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed
      .map((item) => (typeof item === "string" ? normalizeSize(item) : ""))
      .filter(Boolean)
      .slice(0, RECENT_SIZE_LIMIT);
  } catch {
    return [] as string[];
  }
}

function saveRecentSizes(sizes: string[]) {
  try {
    localStorage.setItem(RECENT_SIZE_STORAGE_KEY, JSON.stringify(sizes.slice(0, RECENT_SIZE_LIMIT)));
  } catch {
    // Ignore localStorage quota or privacy-mode failures.
  }
}

export const GenerationPanel = memo(function GenerationPanel({ form, error, model, onChange, onSubmit }: GenerationPanelProps) {
  const { t } = useTranslation();
  const initialParsedSize = parseSize(form.size);
  const [sliderWidth, setSliderWidth] = useState(initialParsedSize?.width ?? DEFAULT_SIZE);
  const [sliderHeight, setSliderHeight] = useState(initialParsedSize?.height ?? DEFAULT_SIZE);
  const [recentSizes, setRecentSizes] = useState<string[]>(() => loadRecentSizes());
  const [inputImageError, setInputImageError] = useState("");
  const maskFileInputRef = useRef<HTMLInputElement>(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const closeMaskEditor = useCallback(() => setMaskEditorOpen(false), []);
  const widthId = useId();
  const heightId = useId();
  const countId = useId();

  const strictPng = modelRequiresStrictPng(model ?? "");
  const supportsMultiImage = modelLikelySupportsMultipleImages(model ?? "");
  const isEditMode = form.inputImages.length > 0;
  const modelSizingProfile = useMemo(() => getModelSizingProfile(model ?? ""), [model]);
  const sizePresetGroups = useMemo(() => getSizePresetGroupsForModel(model ?? ""), [model]);
  // gpt-image-2: 16px alignment required; gemini: free input (only aspect_ratio matters); others: 64px slider step (cosmetic)
  const sliderStep = modelSizingProfile.mode === "gptImage2" ? 16 : modelSizingProfile.mode === "geminiAspect" ? 8 : SIZE_STEP;

  useEffect(() => {
    const parsed = parseSize(form.size);
    if (!parsed) {
      return;
    }

    setSliderWidth((current) => (current === parsed.width ? current : parsed.width));
    setSliderHeight((current) => (current === parsed.height ? current : parsed.height));
  }, [form.size]);

  const currentSize = useMemo(() => `${sliderWidth}x${sliderHeight}`, [sliderHeight, sliderWidth]);
  const currentRatioLabel = useMemo(() => getRatioLabel(currentSize), [currentSize]);

  function isSizeActive(size: string) {
    const normalizedCurrent = normalizeSize(form.size);
    const normalizedSize = normalizeSize(size);
    if (normalizedSize) {
      return normalizedCurrent === normalizedSize;
    }
    return form.size.trim().toLowerCase() === size.trim().toLowerCase();
  }

  function rememberSize(value: string) {
    const normalized = normalizeSize(value);

    if (!normalized) {
      return;
    }

    setRecentSizes((current) => {
      const next = [normalized, ...current.filter((item) => item !== normalized)].slice(
        0,
        RECENT_SIZE_LIMIT,
      );
      saveRecentSizes(next);
      return next;
    });
  }

  function applySize(value: string) {
    const parsed = parseSize(value);
    if (!parsed) {
      onChange({ size: value });
      return;
    }

    const normalizedSize = `${parsed.width}x${parsed.height}`;
    setSliderWidth(parsed.width);
    setSliderHeight(parsed.height);
    onChange({ size: normalizedSize });
    rememberSize(normalizedSize);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    rememberSize(form.size);
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
        setInputImageError(t("generation.inputImages.title") + ": " + reason);
        prepared.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return;
      }
    }
    if (prepared.length === 0) return;

    // If this is the first input image being added, auto-fill size with the
    // image's native resolution so the user gets pixel-perfect defaults.
    const isFirstImage = form.inputImages.length === 0;
    const updates: Partial<GenerateFormState> = {
      inputImages: [...form.inputImages, ...prepared],
    };
    if (isFirstImage && prepared[0]) {
      const nativeSize = `${prepared[0].width}x${prepared[0].height}`;
      updates.size = nativeSize;
      setSliderWidth(prepared[0].width);
      setSliderHeight(prepared[0].height);
      rememberSize(nativeSize);
    }
    onChange(updates);
  }

  async function handleAddMask(file: File) {
    setInputImageError("");
    if (form.inputImages.length === 0) {
      setInputImageError(t("generation.inputImages.mask") + ": requires at least one input image first.");
      return;
    }
    try {
      // Not prepareInputImage: its strict mode also demands a square image
      // (a dall-e-2 input rule), which rejected masks for any other ratio.
      if (file.type !== "image/png") {
        throw new InputImageError(`Mask must be a PNG. Got: ${file.type || "unknown"}.`);
      }
      const mask = await toInputImageFile(file);
      assertMaskMatchesImage(mask, form.inputImages[0]);
      if (form.maskImage) URL.revokeObjectURL(form.maskImage.previewUrl);
      onChange({ maskImage: mask });
    } catch (err) {
      const reason = err instanceof InputImageError ? err.message : String(err);
      setInputImageError(t("generation.inputImages.mask") + ": " + reason);
    }
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
    // Mask must be dropped if its reference (first image) is gone.
    if (form.inputImages[0]?.id === id && form.maskImage) {
      URL.revokeObjectURL(form.maskImage.previewUrl);
      onChange({ maskImage: null });
    }
  }

  function handlePaintedMask(file: File | null) {
    setMaskEditorOpen(false);
    if (file) {
      void handleAddMask(file);
    } else {
      removeMask();
    }
  }

  function removeMask() {
    if (form.maskImage) URL.revokeObjectURL(form.maskImage.previewUrl);
    onChange({ maskImage: null });
  }

  function onMaskInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleAddMask(file);
    }
    event.target.value = "";
  }

  const acceptMime = strictPng ? "image/png" : "image/png,image/jpeg,image/webp";
  const showMultiImageWarning =
    form.inputImages.length > 1 && !!model && !supportsMultiImage;

  const submitLabel = isEditMode ? t("generation.edit") : t("generation.generate");

  return (
    <form className="flex min-h-full flex-col" onSubmit={handleSubmit} aria-labelledby="generate-heading" noValidate>
      <div className="flex-1 space-y-5 p-4">
        <div>
          <h2 id="generate-heading" className="sr-only">{t("generation.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("generation.subtitle")}</p>
        </div>

        <Field label={t("generation.prompt")} id="prompt">
          <Textarea
            className="min-h-32 resize-y leading-relaxed"
            placeholder={t("generation.promptPlaceholder")}
            value={form.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            onKeyDown={submitOnModEnter}
          />
        </Field>

        <ImageDropzone
          images={form.inputImages}
          onAdd={handleAddInputImages}
          onRemove={removeInputImage}
          title={t("generation.inputImages.title")}
          hint={t("generation.inputImages.hint")}
          addButtonLabel={t("generation.inputImages.addButton")}
          removeLabel={t("generation.inputImages.remove")}
          accept={acceptMime}
          badge={isEditMode ? t("generation.inputImages.editModeBadge") : undefined}
          warning={showMultiImageWarning ? t("generation.inputImages.multipleImagesWarning") : undefined}
          error={inputImageError || undefined}
          sizeLabel={(width, height) => t("generation.inputImages.size", { width, height })}
        >
          {isEditMode ? (
            <div className="mt-2 grid gap-2 rounded-md bg-muted/60 p-3">
              <div>
                <p className="text-sm font-medium">{t("generation.inputImages.mask")}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("generation.inputImages.maskHint")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMaskEditorOpen(true)}>
                  <Brush aria-hidden="true" />
                  {form.maskImage ? t("generation.inputImages.editMaskButton") : t("generation.inputImages.paintMaskButton")}
                </Button>
                {form.maskImage ? (
                  <div className="flex items-center gap-2 rounded-md border bg-background py-1 pl-1 pr-1.5">
                    <img
                      src={form.maskImage.previewUrl}
                      alt={form.maskImage.file.name}
                      className="size-7 rounded-sm object-cover"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {form.maskImage.width}×{form.maskImage.height}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`${t("generation.inputImages.remove")}: ${t("generation.inputImages.mask")}`}
                      onClick={removeMask}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => maskFileInputRef.current?.click()}>
                      <Upload aria-hidden="true" />
                      {t("generation.inputImages.addMaskButton")}
                    </Button>
                    <input
                      ref={maskFileInputRef}
                      type="file"
                      accept="image/png"
                      hidden
                      onChange={onMaskInputChange}
                    />
                  </>
                )}
              </div>
            </div>
          ) : null}
        </ImageDropzone>

        {maskEditorOpen && form.inputImages[0] ? (
          <MaskEditor
            image={form.inputImages[0]}
            initialMask={form.maskImage}
            onApply={handlePaintedMask}
            onCancel={closeMaskEditor}
          />
        ) : null}

        <fieldset className="grid gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <legend className="text-sm font-medium leading-none">{t("generation.size")}</legend>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {sliderWidth}×{sliderHeight}
              {currentRatioLabel ? ` · ${currentRatioLabel}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={widthId} className="text-xs font-normal text-muted-foreground">
                {t("generation.widthPixels")}
              </Label>
              <Input
                id={widthId}
                className="tabular-nums"
                type="number"
                inputMode="numeric"
                min={MIN_SIZE}
                max={MAX_SIZE}
                step="any"
                value={sliderWidth}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (!Number.isFinite(raw) || raw <= 0) return;
                  setSliderWidth(raw);
                  // Sync now, not just on blur: Enter submits without blurring.
                  // Out-of-range values are left for blur to clamp (syncing them
                  // would clamp mid-typing) and the input's min/max block submit.
                  if (raw >= MIN_SIZE && raw <= MAX_SIZE) onChange({ size: `${raw}x${sliderHeight}` });
                }}
                onBlur={() => {
                  const clamped = clampDimensionExact(sliderWidth);
                  setSliderWidth(clamped);
                  applySize(`${clamped}x${sliderHeight}`);
                }}
              />
              <Slider
                aria-label={t("generation.widthPixels")}
                min={MIN_SIZE}
                max={MAX_SIZE}
                step={sliderStep}
                value={[sliderWidth]}
                onValueChange={([value]) => {
                  const nextWidth = clampDimension(value, sliderStep);
                  setSliderWidth(nextWidth);
                  applySize(`${nextWidth}x${sliderHeight}`);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={heightId} className="text-xs font-normal text-muted-foreground">
                {t("generation.heightPixels")}
              </Label>
              <Input
                id={heightId}
                className="tabular-nums"
                type="number"
                inputMode="numeric"
                min={MIN_SIZE}
                max={MAX_SIZE}
                step="any"
                value={sliderHeight}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (!Number.isFinite(raw) || raw <= 0) return;
                  setSliderHeight(raw);
                  if (raw >= MIN_SIZE && raw <= MAX_SIZE) onChange({ size: `${sliderWidth}x${raw}` });
                }}
                onBlur={() => {
                  const clamped = clampDimensionExact(sliderHeight);
                  setSliderHeight(clamped);
                  applySize(`${sliderWidth}x${clamped}`);
                }}
              />
              <Slider
                aria-label={t("generation.heightPixels")}
                min={MIN_SIZE}
                max={MAX_SIZE}
                step={sliderStep}
                value={[sliderHeight]}
                onValueChange={([value]) => {
                  const nextHeight = clampDimension(value, sliderStep);
                  setSliderHeight(nextHeight);
                  applySize(`${sliderWidth}x${nextHeight}`);
                }}
              />
            </div>
          </div>

          {/* Reference image native resolution */}
          {form.inputImages.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-xs text-muted-foreground">{t("generation.refImageSize")}</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Map(form.inputImages.map((img) => [`${img.width}x${img.height}`, img])).values()).map(
                  (img) => {
                    const sizeStr = `${img.width}x${img.height}`;
                    return (
                      <Chip
                        key={sizeStr}
                        active={isSizeActive(sizeStr)}
                        onClick={() => applySize(sizeStr)}
                        title={t("generation.refImageSizeHint")}
                      >
                        <ImageIcon aria-hidden="true" className="size-3" />
                        {sizeStr} · {getRatioLabel(sizeStr)}
                      </Chip>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}

          <p className="flex gap-1.5 text-xs leading-5 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t(`generation.sizeCompatibility.${modelSizingProfile.mode}`)}{" "}
              {t("generation.sizeStepHint", { step: sliderStep })}
            </span>
          </p>
        </fieldset>

        <Disclosure title={t("generation.sizeMoreOptions")} summary={recentSizes[0]}>
          <Field label={t("generation.size")}>
            <Input
              className="font-mono text-xs"
              spellCheck={false}
              placeholder={t("generation.sizePlaceholder")}
              value={form.size}
              onChange={(event) => onChange({ size: event.target.value })}
              onBlur={() => applySize(form.size)}
            />
          </Field>

          <div className="grid gap-2">
            <div>
              <p className="text-sm font-medium">{t("generation.commonSizes")}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("generation.commonSizesHint")}</p>
            </div>
            <dl className="grid gap-2">
              {sizePresetGroups.map((group) => (
                <div key={group.ratio} className="grid grid-cols-[3rem_1fr] items-start gap-2">
                  <dt className="pt-1.5 font-mono text-xs text-muted-foreground">{group.ratio}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {group.sizes.map((size) => (
                      <Chip key={size} active={isSizeActive(size)} onClick={() => applySize(size)}>
                        {size}
                      </Chip>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("generation.recentSizes")}</p>
            {recentSizes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recentSizes.map((size) => (
                  <Chip key={size} active={isSizeActive(size)} onClick={() => applySize(size)}>
                    {size}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("generation.recentSizesEmpty")}</p>
            )}
          </div>
        </Disclosure>

        <Disclosure
          title={t("generation.advancedJsonParams")}
          summary={form.advancedJson.trim() ? "{…}" : undefined}
        >
          <Field label={t("generation.advancedJsonParams")} className="[&>div:first-child]:sr-only">
            <Textarea
              className="min-h-24 resize-y font-mono text-xs"
              spellCheck={false}
              placeholder={'{\n  "quality": "high",\n  "style": "vivid"\n}'}
              value={form.advancedJson}
              onChange={(event) => onChange({ advancedJson: event.target.value })}
            />
          </Field>
        </Disclosure>

        {error ? <Notice variant="error">{error}</Notice> : null}
      </div>

      <div className="sticky bottom-0 z-10 flex items-end gap-2 border-t bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="grid w-20 gap-1">
          <Label htmlFor={countId} className="text-xs font-normal text-muted-foreground">
            {t("generation.imageCount")}
          </Label>
          <Input
            id={countId}
            className="tabular-nums"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={form.count}
            onChange={(event) => onChange({ count: Number(event.target.value) })}
          />
        </div>
        <Button type="submit" variant="brand" className="h-9 flex-1" aria-keyshortcuts="Control+Enter Meta+Enter">
          {isEditMode ? <Wand2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {submitLabel}
          <kbd className="ml-1 hidden rounded border border-brand-foreground/30 px-1 font-mono text-[10px] font-normal opacity-80 sm:inline">
            {MOD_KEY_LABEL} ↵
          </kbd>
        </Button>
      </div>
    </form>
  );
});
