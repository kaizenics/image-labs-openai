import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Brush, Check, Eraser, Trash2 } from "lucide-react";
import type { InputImageFile } from "../types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PAINT_COLOR = "rgb(244, 63, 94)";

interface MaskEditorProps {
  image: InputImageFile;
  initialMask: InputImageFile | null;
  /** Receives the mask PNG, or null when nothing is painted. */
  onApply: (mask: File | null) => void;
  onCancel: () => void;
}

/**
 * Paint the region to redraw on top of the first reference image. The painted
 * layer lives at the image's native resolution; on apply it becomes an OpenAI
 * style mask: opaque everywhere except the painted (editable) areas.
 */
export function MaskEditor({ image, initialMask, onApply, onCancel }: MaskEditorProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(() => Math.round(Math.max(image.width, image.height) / 20));
  const [erasing, setErasing] = useState(false);
  const maxBrush = Math.round(Math.max(image.width, image.height) / 4);
  const brushSizeId = useId();
  // The dialog portal mounts its content one render late, so the mask seeding
  // effect below waits for the canvas node instead of reading the ref on mount.
  const [canvasMounted, setCanvasMounted] = useState(false);
  const setCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasMounted(node !== null);
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!initialMask || !ctx) return;

    // Painted = where the existing mask is transparent.
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = PAINT_COLOR;
      ctx.fillRect(0, 0, image.width, image.height);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(img, 0, 0, image.width, image.height);
      ctx.globalCompositeOperation = "source-over";
    };
    img.src = initialMask.previewUrl;
  }, [image.height, image.width, initialMask, canvasMounted]);

  // Escape is handled by the Dialog (onOpenChange -> onCancel).

  function toCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function paint(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.fillStyle = PAINT_COLOR;
    ctx.strokeStyle = PAINT_COLOR;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (from.x === to.x && from.y === to.y) {
      ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toCanvasPoint(event);
    lastPointRef.current = point;
    paint(point, point);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const last = lastPointRef.current;
    if (!last) return;
    const point = toCanvasPoint(event);
    paint(last, point);
    lastPointRef.current = point;
  }

  function handlePointerUp() {
    lastPointRef.current = null;
  }

  function clear() {
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, image.width, image.height);
  }

  function apply() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = false;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) {
        painted = true;
        break;
      }
    }
    if (!painted) {
      onApply(null);
      return;
    }

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = out.getContext("2d");
    if (!outCtx) return;
    outCtx.fillStyle = "#000";
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.globalCompositeOperation = "destination-out";
    outCtx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => {
      if (blob) onApply(new File([blob], "mask.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-4 overflow-auto p-4 sm:p-5"
        // An accidental click outside must not throw away the painted mask.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{t("maskEditor.title")}</DialogTitle>
          <DialogDescription className="text-xs leading-5">{t("maskEditor.hint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={erasing ? "eraser" : "brush"}
            onValueChange={(value) => {
              if (value) setErasing(value === "eraser");
            }}
          >
            <ToggleGroupItem value="brush" aria-label={t("maskEditor.brush")} className="px-3 text-xs data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background">
              <Brush aria-hidden="true" />
              {t("maskEditor.brush")}
            </ToggleGroupItem>
            <ToggleGroupItem value="eraser" aria-label={t("maskEditor.eraser")} className="px-3 text-xs data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background">
              <Eraser aria-hidden="true" />
              {t("maskEditor.eraser")}
            </ToggleGroupItem>
          </ToggleGroup>

          <div role="group" aria-labelledby={brushSizeId} className="flex min-w-48 flex-1 items-center gap-3 sm:max-w-xs">
            <span id={brushSizeId} className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {t("maskEditor.brushSize", { size: brushSize })}
            </span>
            <Slider
              aria-labelledby={brushSizeId}
              min={1}
              max={maxBrush}
              step={1}
              value={[brushSize]}
              onValueChange={([value]) => setBrushSize(value)}
            />
          </div>
        </div>

        <div className="flex justify-center rounded-lg border bg-muted p-2">
          <div className="relative inline-block">
            <img
              src={image.previewUrl}
              alt={image.file.name}
              className="block max-h-[60vh] max-w-full select-none"
              draggable={false}
            />
            <canvas
              ref={setCanvas}
              role="img"
              aria-label={t("maskEditor.canvasLabel")}
              width={image.width}
              height={image.height}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" className="sm:mr-auto" onClick={clear}>
            <Trash2 aria-hidden="true" />
            {t("maskEditor.clear")}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("maskEditor.cancel")}
          </Button>
          <Button type="button" variant="brand" onClick={apply}>
            <Check aria-hidden="true" />
            {t("maskEditor.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
