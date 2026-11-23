import { memo, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { InputImageFile } from "../types";
import { copyImage, downloadImage } from "../lib/download";
import { toInputImageFile } from "../lib/imageInput";
import { CROP_RATIOS, MAX_OUTPUT_WIDTH, centerCrop, transformImage, type ToolFormat } from "../lib/imageTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Chip } from "./Chip";
import { Field } from "./Field";
import { ImageDropzone } from "./ImageDropzone";
import { Notice } from "./Notice";

const FORMATS: ReadonlyArray<{ mime: ToolFormat; label: string }> = [
  { mime: "image/png", label: "PNG" },
  { mime: "image/jpeg", label: "JPEG" },
  { mime: "image/webp", label: "WebP" },
];

interface Result {
  url: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(2)} MB`;
}

/** Local crop / resize / convert. Nothing is sent anywhere. */
export const ImageToolsPanel = memo(function ImageToolsPanel() {
  const { t } = useTranslation();
  const widthId = useId();
  const [image, setImage] = useState<InputImageFile | null>(null);
  const [ratioId, setRatioId] = useState("original");
  const [width, setWidth] = useState(0);
  const [format, setFormat] = useState<ToolFormat>("image/png");
  const [quality, setQuality] = useState(0.9);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultUrlRef = useRef<string | null>(null);
  const imageRef = useRef<InputImageFile | null>(null);
  imageRef.current = image;

  const ratio = CROP_RATIOS.find((item) => item.id === ratioId)?.ratio ?? null;

  useEffect(
    () => () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.previewUrl);
    },
    [],
  );

  useEffect(() => {
    if (!image || width < 1) {
      setResult(null);
      return;
    }
    let stale = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      transformImage(image.file, { ratio, width, format, quality })
        .then(({ blob, width: outWidth, height: outHeight }) => {
          if (stale) return;
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          resultUrlRef.current = URL.createObjectURL(blob);
          setError("");
          setResult({ url: resultUrlRef.current, width: outWidth, height: outHeight, bytes: blob.size, mime: blob.type });
        })
        .catch(() => !stale && setError(t("tools.failed")))
        .finally(() => !stale && setBusy(false));
    }, 150);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [image, ratio, width, format, quality, t]);

  function selectRatio(id: string, nextRatio: number | null) {
    setRatioId(id);
    if (image) setWidth(centerCrop(image.width, image.height, nextRatio).width);
  }

  async function handleAdd(files: FileList | File[]) {
    const file = Array.from(files).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    setError("");
    const next = await toInputImageFile(file);
    if (next.width < 1) {
      URL.revokeObjectURL(next.previewUrl);
      setError(t("tools.failed"));
      return;
    }
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(next);
    setWidth(centerCrop(next.width, next.height, ratio).width);
  }

  function handleRemove() {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
    setResult(null);
    setError("");
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await copyImage(result.url);
      toast.success(t("tools.copied"));
    } catch {
      toast.error(t("tools.copyFailed"));
    }
  }

  return (
    <div className="space-y-5 p-4">
      <p className="text-sm text-muted-foreground">{t("tools.subtitle")}</p>

      <ImageDropzone
        images={image ? [image] : []}
        onAdd={handleAdd}
        onRemove={handleRemove}
        title={t("tools.input")}
        hint={t("tools.hint")}
        addButtonLabel={t("tools.add")}
        removeLabel={t("tools.remove")}
        error={error || undefined}
      />

      {image ? (
        <>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium leading-none">{t("tools.crop")}</p>
            <div className="flex flex-wrap gap-1.5">
              {CROP_RATIOS.map((item) => (
                <Chip key={item.id} active={ratioId === item.id} onClick={() => selectRatio(item.id, item.ratio)}>
                  {item.id === "original" ? t("tools.cropOriginal") : item.id}
                </Chip>
              ))}
            </div>
          </div>

          <Field label={t("tools.width")} id={widthId}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_OUTPUT_WIDTH}
              className="tabular-nums"
              value={width || ""}
              onChange={(event) => setWidth(Math.min(MAX_OUTPUT_WIDTH, Math.max(0, Math.floor(Number(event.target.value) || 0))))}
            />
          </Field>

          <div className="grid gap-1.5">
            <p className="text-sm font-medium leading-none">{t("tools.format")}</p>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((item) => (
                <Chip key={item.mime} active={format === item.mime} onClick={() => setFormat(item.mime)}>
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>

          {format !== "image/png" ? (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium leading-none">{t("tools.quality")}</p>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(quality * 100)}</span>
              </div>
              <Slider
                aria-label={t("tools.quality")}
                min={0.1}
                max={1}
                step={0.05}
                value={[quality]}
                onValueChange={([value]) => setQuality(value)}
              />
            </div>
          ) : null}

          <section aria-label={t("tools.result")} className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium leading-none">{t("tools.result")}</p>
              {busy ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  {t("tools.working")}
                </span>
              ) : result ? (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {t("tools.outputSize", { width: result.width, height: result.height, size: formatBytes(result.bytes) })}
                </span>
              ) : null}
            </div>
            {result ? (
              <>
                <img src={result.url} alt={t("tools.result")} className="max-h-72 w-full rounded-md border bg-muted object-contain" />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={() => void downloadImage(result.url, `image-tools-${Date.now()}`, result.mime)}
                  >
                    <Download aria-hidden="true" />
                    {t("tools.download")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                    <ClipboardCopy aria-hidden="true" />
                    {t("tools.copy")}
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : (
        <Notice>{t("tools.empty")}</Notice>
      )}
    </div>
  );
});
