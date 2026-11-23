import { memo, useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { InputImageError, prepareInputImage } from "../lib/imageInput";
import type { InputImageFile, VisionDetail, VisionFormState } from "../types";
import { Notice } from "./Notice";
import { ImageDropzone } from "./ImageDropzone";
import { Field } from "./Field";
import { Disclosure } from "./Disclosure";
import { Info, ScanEye } from "lucide-react";
import { MOD_KEY_LABEL, submitOnModEnter } from "@/lib/keyboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VisionPanelProps {
  form: VisionFormState;
  error: string;
  visionModel: string;
  onChange: (next: Partial<VisionFormState>) => void;
  onSubmit: () => void;
}

export const VisionPanel = memo(function VisionPanel({ form, error, visionModel, onChange, onSubmit }: VisionPanelProps) {
  const { t, i18n } = useTranslation();
  const [inputImageError, setInputImageError] = useState("");
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const detailId = useId();
  // Remembers the default we injected so that switching UI language also
  // switches the prompt, but only while the user has not written their own.
  // Fills the default prompt on mount while the user hasn't typed their own.
  const injectedDefaultRef = useRef<string | null>(null);

  useEffect(() => {
    const localizedDefault = t("vision.defaultPrompt");
    const isUntouched = form.prompt === "" || form.prompt === injectedDefaultRef.current;

    if (isUntouched && form.prompt !== localizedDefault) {
      injectedDefaultRef.current = localizedDefault;
      onChange({ prompt: localizedDefault });
    }
    // `form.prompt` is read but deliberately excluded:
    // including it would re-run this on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.resolvedLanguage, t]);

  async function handleAddInputImages(files: FileList | File[]) {
    setInputImageError("");
    const list = Array.from(files);
    const prepared: InputImageFile[] = [];

    for (const file of list) {
      try {
        prepared.push(await prepareInputImage(file));
      } catch (err) {
        const reason = err instanceof InputImageError ? err.message : String(err);
        setInputImageError(t("vision.inputImages.title") + ": " + reason);
        prepared.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return;
      }
    }

    if (prepared.length === 0) {
      return;
    }

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={handleSubmit} aria-labelledby="vision-heading" noValidate>
      <div className="flex-1 space-y-5 p-4">
        <div>
          <h2 id="vision-heading" className="sr-only">{t("vision.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("vision.subtitle")}</p>
        </div>

        <ImageDropzone
          images={form.inputImages}
          onAdd={handleAddInputImages}
          onRemove={removeInputImage}
          title={t("vision.inputImages.title")}
          hint={t("vision.inputImages.hint")}
          addButtonLabel={t("vision.inputImages.addButton")}
          removeLabel={t("vision.inputImages.remove")}
          badge={
            form.inputImages.length > 0
              ? t("vision.inputImages.badge", { count: form.inputImages.length })
              : undefined
          }
          error={inputImageError || undefined}
          sizeLabel={(width, height) => t("vision.inputImages.size", { width, height })}
        />

        <Field label={t("vision.prompt")}>
          <Textarea
            className="min-h-28 resize-y leading-relaxed"
            placeholder={t("vision.promptPlaceholder")}
            value={form.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            onKeyDown={submitOnModEnter}
          />
        </Field>

        <p className="flex gap-1.5 text-xs leading-5 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("vision.modelHint", { model: visionModel || "-" })}</span>
        </p>

        <Disclosure title={t("vision.detail")} summary={form.detail}>
          <Field label={t("vision.detail")} id={detailId} hint={t("vision.detailHint")} className="[&>div:first-child]:sr-only">
            <Select value={form.detail} onValueChange={(value) => onChange({ detail: value as VisionDetail })}>
              <SelectTrigger id={detailId} className="font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="font-mono text-xs">auto</SelectItem>
                <SelectItem value="high" className="font-mono text-xs">high</SelectItem>
                <SelectItem value="low" className="font-mono text-xs">low</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Disclosure>

        <Disclosure
          title={t("vision.advancedJsonParams")}
          summary={form.advancedJson.trim() ? "{…}" : undefined}
        >
          <Field label={t("vision.advancedJsonParams")} className="[&>div:first-child]:sr-only">
            <Textarea
              className="min-h-24 resize-y font-mono text-xs"
              spellCheck={false}
              placeholder={'{\n  "max_output_tokens": 3000\n}'}
              value={form.advancedJson}
              onChange={(event) => onChange({ advancedJson: event.target.value })}
            />
          </Field>
        </Disclosure>

        {error ? <Notice variant="error">{error}</Notice> : null}
      </div>

      <div className="sticky bottom-0 z-10 max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex items-end gap-2 border-t bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Button
          type="submit"
          variant="brand"
          className="h-9 flex-1"
          disabled={form.inputImages.length === 0}
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          <ScanEye aria-hidden="true" />
          {t("vision.analyze")}
          <kbd className="ml-1 hidden rounded border border-brand-foreground/30 px-1 font-mono text-[10px] font-normal opacity-80 sm:inline">
            {MOD_KEY_LABEL} ↵
          </kbd>
        </Button>
      </div>
    </form>
  );
});
