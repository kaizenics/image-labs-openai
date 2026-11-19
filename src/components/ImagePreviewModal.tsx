import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { downloadImage } from "../lib/download";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

export interface PreviewState {
  urls: string[];
  index: number;
}

interface ImagePreviewModalProps {
  preview: PreviewState | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

const navButtonClass = "absolute top-1/2 z-10 size-10 -translate-y-1/2";

export function ImagePreviewModal({ preview, onNavigate, onClose }: ImagePreviewModalProps) {
  const { t } = useTranslation();
  const count = preview?.urls.length ?? 0;
  const index = preview?.index ?? 0;

  useEffect(() => {
    if (!preview) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && count > 1) {
        onNavigate((index - 1 + count) % count);
      } else if (event.key === "ArrowRight" && count > 1) {
        onNavigate((index + 1) % count);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, count, index, onClose, onNavigate]);

  if (!preview) {
    return null;
  }

  const imageUrl = preview.urls[index];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/90" />
        {/* The viewer is always on a black backdrop, so it uses the dark tokens in both themes. */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="dark fixed inset-0 z-50 flex flex-col text-foreground focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <DialogTitle className="sr-only">{t("preview.alt")}</DialogTitle>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {count > 1 ? `${index + 1} / ${count}` : null}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void downloadImage(imageUrl, `openai-image-${Date.now()}`)}
              >
                <Download aria-hidden="true" />
                {t("tasks.actions.download")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onClose} aria-label={t("preview.closePreview")}>
                <X aria-hidden="true" />
                {t("preview.close")}
              </Button>
            </div>
          </div>

          {/* Clicking the empty area around the image closes the viewer, like the old backdrop. */}
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 md:px-16"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            {count > 1 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`${navButtonClass} left-4`}
                  onClick={() => onNavigate((index - 1 + count) % count)}
                  aria-label={t("preview.previous")}
                >
                  <ChevronLeft aria-hidden="true" className="!size-5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`${navButtonClass} right-4`}
                  onClick={() => onNavigate((index + 1) % count)}
                  aria-label={t("preview.next")}
                >
                  <ChevronRight aria-hidden="true" className="!size-5" />
                </Button>
              </>
            ) : null}
            <img className="max-h-full max-w-full rounded-md object-contain" src={imageUrl} alt={t("preview.alt")} />
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
