import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";
import type { InputImageFile } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ImageDropzoneProps {
  images: InputImageFile[];
  /** Called with files from drag & drop or the file picker. May be async. */
  onAdd: (files: FileList | File[]) => void | Promise<void>;
  onRemove: (id: string) => void;
  /** Kept for API compatibility; the redesign uses a single accent. */
  accent?: "sky" | "violet";
  title: string;
  hint: string;
  addButtonLabel: string;
  removeLabel: string;
  accept?: string;
  /** Optional badge shown in the header row (e.g. edit-mode / count badge). */
  badge?: string;
  /** Optional warning shown below the grid (e.g. multi-image model warning). */
  warning?: string;
  /** Optional error shown below the grid. */
  error?: string;
  /** Formats the dimension overlay on each thumbnail. Defaults to "WxH". */
  sizeLabel?: (width: number, height: number) => string;
  /** Extra content rendered between the thumbnail grid and the warning/error. */
  children?: ReactNode;
}

export function ImageDropzone({
  images,
  onAdd,
  onRemove,
  title,
  hint,
  addButtonLabel,
  removeLabel,
  accept = "image/png,image/jpeg,image/webp",
  badge,
  warning,
  error,
  sizeLabel = (width, height) => `${width}×${height}`,
  children,
}: ImageDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasImages = images.length > 0;

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      void onAdd(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void onAdd(files);
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Ignore leave events fired when moving between children.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="text-sm font-medium leading-none">{title}</span>
        {badge ? (
          <Badge variant="outline" className="border-brand/40 bg-brand-soft font-medium text-foreground">
            {badge}
          </Badge>
        ) : null}
      </div>

      <div
        className={cn(
          "rounded-md border border-dashed p-2 transition-colors",
          isDragging ? "border-brand bg-brand-soft" : "border-input",
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {hasImages ? (
          <ul className="flex flex-wrap gap-2">
            {images.map((item) => (
              <li
                key={item.id}
                className="group relative size-[4.5rem] overflow-hidden rounded-md border bg-muted"
                title={`${item.file.name} · ${item.width}×${item.height}`}
              >
                <img src={item.previewUrl} alt={item.file.name} className="size-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center font-mono text-[10px] leading-4 text-white">
                  {sizeLabel(item.width, item.height)}
                </span>
                <button
                  type="button"
                  aria-label={`${removeLabel}: ${item.file.name}`}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                  onClick={() => onRemove(item.id)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex size-[4.5rem] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus aria-hidden="true" className="size-4" />
                {addButtonLabel}
              </button>
            </li>
          </ul>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">
              <ImagePlus aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{addButtonLabel}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>
            </span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={onFileInputChange}
        />
      </div>

      {hasImages ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}

      {children}

      {warning ? (
        <p role="status" className="text-xs leading-5 text-warning">
          {warning}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
