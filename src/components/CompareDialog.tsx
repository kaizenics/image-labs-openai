import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "./Chip";

export interface CompareImage {
  url: string;
  /** Short caption, e.g. model and size. */
  caption: string;
  alt: string;
}

interface CompareDialogProps {
  images: [CompareImage, CompareImage] | null;
  onClose: () => void;
}

/** Two images side by side, or stacked with a draggable wipe. */
export function CompareDialog({ images, onClose }: CompareDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"side" | "slider">("side");
  const [position, setPosition] = useState(50);
  const [ratio, setRatio] = useState(1);

  return (
    <Dialog open={images !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("library.compare.title")}</DialogTitle>
          <DialogDescription>{t("library.compare.description")}</DialogDescription>
        </DialogHeader>

        {images ? (
          <>
            <div className="flex gap-1.5">
              <Chip active={mode === "side"} onClick={() => setMode("side")}>
                {t("library.compare.sideBySide")}
              </Chip>
              <Chip active={mode === "slider"} onClick={() => setMode("slider")}>
                {t("library.compare.slider")}
              </Chip>
            </div>

            {mode === "side" ? (
              <div className="grid grid-cols-2 gap-3">
                {images.map((image, index) => (
                  <figure key={index} className="grid gap-1.5">
                    <img src={image.url} alt={image.alt} className="max-h-[65vh] w-full rounded-md border bg-muted object-contain" />
                    <figcaption className="truncate font-mono text-xs text-muted-foreground" title={image.caption}>
                      {image.caption}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                <div
                  className="relative mx-auto w-full overflow-hidden rounded-md border bg-muted"
                  style={{ aspectRatio: ratio, maxWidth: `calc(65vh * ${ratio})` }}
                >
                  <img
                    src={images[1].url}
                    alt={images[1].alt}
                    className="absolute inset-0 size-full object-contain"
                    onLoad={(event) => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || 1)}
                  />
                  <img
                    src={images[0].url}
                    alt={images[0].alt}
                    className="absolute inset-0 size-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                  />
                  <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand" style={{ left: `${position}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={position}
                  aria-label={t("library.compare.wipe")}
                  className="w-full accent-brand"
                  onChange={(event) => setPosition(Number(event.target.value))}
                />
                <div className="flex justify-between gap-3 font-mono text-xs text-muted-foreground">
                  <span className="truncate" title={images[0].caption}>
                    {t("library.compare.left")}: {images[0].caption}
                  </span>
                  <span className="truncate text-right" title={images[1].caption}>
                    {t("library.compare.right")}: {images[1].caption}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
