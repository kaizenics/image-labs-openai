import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { getCachedInputs, listCachedImages, type CachedImageRecord } from "../lib/imageCache";
import { toInputImageFile } from "../lib/imageInput";
import { copyText, downloadImage } from "../lib/download";
import { downloadLibraryZip } from "../lib/libraryExport";
import type { ImageCacheStats, ReuseParamsPayload } from "../types";
import { ImageCacheSummary } from "./ImageCacheSummary";
import { Notice } from "./Notice";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy,
  Download,
  Images,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

const PAGE_SIZE = 50;
const CARD_MIN_WIDTH = 160;
const MAX_COLUMNS = 6;
const GRID_GAP = 12;
const VIRTUAL_ROW_HEIGHT = 280;
const OVERSCAN_ROWS = 2;
const MARQUEE_THRESHOLD = 4;
const AUTO_SCROLL_MARGIN = 80;
const AUTO_SCROLL_SPEED = 14;

interface MarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  origin: Set<string>;
  additive: boolean;
}

function rectsIntersect(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

type LibraryImage = CachedImageRecord & {
  objectUrl: string;
};

interface ImageLibraryProps {
  stats: ImageCacheStats;
  onPreview: (imageUrl: string, gallery: string[]) => void;
  onDeleteImage: (id: string) => void;
  onClearImageCache: () => void;
  onReuseParams: (payload: ReuseParamsPayload) => void;
  onEditImage: (imageUrl: string) => void;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getColumnCount(width: number) {
  if (width <= 0) {
    return 1;
  }

  return Math.min(MAX_COLUMNS, Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));
}

export const ImageLibrary = memo(function ImageLibrary({ stats, onPreview, onDeleteImage, onClearImageCache, onReuseParams, onEditImage }: ImageLibraryProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<LibraryImage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messageKey, setMessageKey] = useState("");
  const [gridWidth, setGridWidth] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0, gridTop: 0 });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LibraryImage | null>(null);
  const hasItems = items.length > 0;
  const objectUrlsRef = useRef(new Set<string>());
  const virtualGridRef = useRef<HTMLDivElement | null>(null);
  const lastClickedIdRef = useRef<string | null>(null);
  const autoScrollRef = useRef<{ direction: -1 | 0 | 1; raf: number }>({ direction: 0, raf: 0 });

  const revokeObjectUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const clearObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const toLibraryImage = useCallback((record: CachedImageRecord): LibraryImage => {
    const objectUrl = URL.createObjectURL(record.blob);
    objectUrlsRef.current.add(objectUrl);
    return { ...record, objectUrl };
  }, []);

  const gridTopRef = useRef(0);

  const updateGridTop = useCallback(() => {
    const grid = virtualGridRef.current;
    if (grid) {
      gridTopRef.current = grid.getBoundingClientRect().top + window.scrollY;
    }
  }, []);

  const updateViewport = useCallback(() => {
    const scrollTop = window.scrollY;
    const height = window.innerHeight;

    if (gridTopRef.current === 0) {
      updateGridTop();
    }

    const rowStride = VIRTUAL_ROW_HEIGHT + GRID_GAP;
    const gridScrollTop = scrollTop - gridTopRef.current;
    const gridScrollBottom = gridScrollTop + height;

    const startRow = Math.max(0, Math.floor(gridScrollTop / rowStride) - OVERSCAN_ROWS);
    const endRow = Math.max(startRow, Math.ceil(gridScrollBottom / rowStride) + OVERSCAN_ROWS);

    setViewport((prev) => {
      const oldGridScrollTop = prev.scrollTop - prev.gridTop;
      const oldGridScrollBottom = oldGridScrollTop + prev.height;
      const oldStartRow = Math.max(0, Math.floor(oldGridScrollTop / rowStride) - OVERSCAN_ROWS);
      const oldEndRow = Math.max(oldStartRow, Math.ceil(oldGridScrollBottom / rowStride) + OVERSCAN_ROWS);

      if (
        oldStartRow !== startRow ||
        oldEndRow !== endRow ||
        Math.abs(prev.gridTop - gridTopRef.current) > 2 ||
        prev.height !== height
      ) {
        return {
          scrollTop,
          height,
          gridTop: gridTopRef.current,
        };
      }
      return prev;
    });
  }, [updateGridTop]);

  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setMessageKey("");

    try {
      const page = await listCachedImages(0, PAGE_SIZE);
      clearObjectUrls();
      setItems(page.images.map(toLibraryImage));
      setHasMore(page.hasMore);
      return true;
    } catch (error) {
      console.warn("[openai-image-webui] Failed to load image library", error);
      setMessageKey("library.messages.loadFailed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [clearObjectUrls, toLibraryImage]);

  // Snapshot of the cache size at the time of the last load, so we can tell
  // the user how many images arrived since then.
  const [loadedCount, setLoadedCount] = useState<number | null>(null);
  const pendingNewCount = loadedCount === null ? 0 : Math.max(0, stats.count - loadedCount);

  const refreshLibrary = useCallback(async () => {
    if (await loadFirstPage()) {
      setLoadedCount(stats.count);
    }
  }, [loadFirstPage, stats.count]);

  const statsCountRef = useRef(stats.count);
  statsCountRef.current = stats.count;

  useEffect(() => {
    void loadFirstPage().then((ok) => {
      if (ok) {
        setLoadedCount(statsCountRef.current);
      }
    });
    // Deliberately runs once on mount. Reloading whenever `stats` changes would
    // yank the user back to page 1 every time a background generation finishes,
    // which makes the library unusable during batch runs. New images are
    // surfaced through the refresh hint instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => clearObjectUrls();
  }, [clearObjectUrls]);

  useEffect(() => {
    updateGridTop();
    updateViewport();
  }, [items.length, updateGridTop, updateViewport]);

  useEffect(() => {
    let frame = 0;

    function scheduleUpdate(forceMeasure = false) {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (forceMeasure) {
          updateGridTop();
        }
        updateViewport();
      });
    }

    const observer = new ResizeObserver(([entry]) => {
      setGridWidth(entry?.contentRect.width ?? 0);
      scheduleUpdate(true);
    });

    if (virtualGridRef.current) {
      observer.observe(virtualGridRef.current);
    }

    const handleScroll = () => scheduleUpdate(false);
    const handleResize = () => scheduleUpdate(true);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    scheduleUpdate(true);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
    // The grid element only mounts once items exist; re-run so the observer
    // attaches to it; otherwise gridWidth stays 0 and everything lays out as
    // one 516px-tall column.
  }, [hasItems, updateGridTop, updateViewport]);


  const virtualGrid = useMemo(() => {
    const columnCount = getColumnCount(gridWidth);
    const rowCount = Math.ceil(items.length / columnCount);
    const rowStride = VIRTUAL_ROW_HEIGHT + GRID_GAP;
    const gridScrollTop = viewport.scrollTop - viewport.gridTop;
    const gridScrollBottom = gridScrollTop + viewport.height;
    const startRow = Math.max(0, Math.floor(gridScrollTop / rowStride) - OVERSCAN_ROWS);
    const endRow = Math.min(
      rowCount,
      Math.max(startRow, Math.ceil(gridScrollBottom / rowStride) + OVERSCAN_ROWS),
    );
    const rows = Array.from({ length: Math.max(0, endRow - startRow) }, (_, index) => {
      const rowIndex = startRow + index;
      const startIndex = rowIndex * columnCount;
      return {
        rowIndex,
        items: items.slice(startIndex, startIndex + columnCount),
      };
    });

    return {
      columnCount,
      rowCount,
      rows,
      totalHeight: rowCount > 0 ? rowCount * VIRTUAL_ROW_HEIGHT + (rowCount - 1) * GRID_GAP : 0,
    };
  }, [gridWidth, items, viewport]);

  const layout = useMemo(() => {
    const columnCount = getColumnCount(gridWidth);
    const columnWidth =
      columnCount > 0 && gridWidth > 0
        ? (gridWidth - (columnCount - 1) * GRID_GAP) / columnCount
        : CARD_MIN_WIDTH;
    return { columnCount, columnWidth };
  }, [gridWidth]);

  const computeMarqueeHits = useCallback(
    (m: MarqueeState): Set<string> => {
      const { columnCount, columnWidth } = layout;
      const r = {
        left: Math.min(m.startX, m.currentX),
        right: Math.max(m.startX, m.currentX),
        top: Math.min(m.startY, m.currentY),
        bottom: Math.max(m.startY, m.currentY),
      };
      const hits = new Set<string>();
      const colStride = columnWidth + GRID_GAP;
      const rowStride = VIRTUAL_ROW_HEIGHT + GRID_GAP;
      for (let i = 0; i < items.length; i += 1) {
        const row = Math.floor(i / columnCount);
        const col = i % columnCount;
        const box = {
          left: col * colStride,
          right: col * colStride + columnWidth,
          top: row * rowStride,
          bottom: row * rowStride + VIRTUAL_ROW_HEIGHT,
        };
        if (rectsIntersect(r, box)) {
          hits.add(items[i].id);
        }
      }
      return hits;
    },
    [items, layout],
  );

  const previewSelection = useMemo<Set<string> | null>(() => {
    if (!marquee) {
      return null;
    }
    const dx = Math.abs(marquee.currentX - marquee.startX);
    const dy = Math.abs(marquee.currentY - marquee.startY);
    if (dx < MARQUEE_THRESHOLD && dy < MARQUEE_THRESHOLD) {
      return marquee.origin;
    }
    const hits = computeMarqueeHits(marquee);
    if (marquee.additive) {
      const merged = new Set(marquee.origin);
      hits.forEach((id) => merged.add(id));
      return merged;
    }
    return hits;
  }, [marquee, computeMarqueeHits]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current.raf) {
      cancelAnimationFrame(autoScrollRef.current.raf);
      autoScrollRef.current.raf = 0;
    }
    autoScrollRef.current.direction = 0;
  }, []);

  const updateAutoScroll = useCallback((clientY: number) => {
    let dir: -1 | 0 | 1 = 0;
    if (clientY < AUTO_SCROLL_MARGIN) {
      dir = -1;
    } else if (clientY > window.innerHeight - AUTO_SCROLL_MARGIN) {
      dir = 1;
    }
    if (dir === autoScrollRef.current.direction) {
      return;
    }
    autoScrollRef.current.direction = dir;
    if (dir === 0) {
      if (autoScrollRef.current.raf) {
        cancelAnimationFrame(autoScrollRef.current.raf);
        autoScrollRef.current.raf = 0;
      }
      return;
    }
    if (autoScrollRef.current.raf) {
      return;
    }
    const tick = () => {
      if (autoScrollRef.current.direction === 0) {
        autoScrollRef.current.raf = 0;
        return;
      }
      window.scrollBy(0, autoScrollRef.current.direction * AUTO_SCROLL_SPEED);
      autoScrollRef.current.raf = requestAnimationFrame(tick);
    };
    autoScrollRef.current.raf = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!marquee) {
      return;
    }

    function onMove(e: MouseEvent) {
      const grid = virtualGridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMarquee((current) => (current ? { ...current, currentX: x, currentY: y } : current));
      updateAutoScroll(e.clientY);
    }

    function onUp() {
      stopAutoScroll();
      setMarquee((current) => {
        if (!current) return null;
        const dx = Math.abs(current.currentX - current.startX);
        const dy = Math.abs(current.currentY - current.startY);
        if (dx < MARQUEE_THRESHOLD && dy < MARQUEE_THRESHOLD) {
          return null;
        }
        const hits = computeMarqueeHits(current);
        if (current.additive) {
          const merged = new Set(current.origin);
          hits.forEach((id) => merged.add(id));
          setSelectedIds(merged);
        } else {
          setSelectedIds(hits);
        }
        return null;
      });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopAutoScroll();
        setMarquee(null);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [marquee, computeMarqueeHits, stopAutoScroll, updateAutoScroll]);

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  function handleGridMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectionMode || e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement;
    // Skip when clicking inside a card; card click handles selection toggle.
    if (target.closest("article")) {
      return;
    }
    const grid = virtualGridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.preventDefault();
    setMarquee({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      origin: new Set(selectedIds),
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
    });
  }

  function toggleSelectOne(id: string, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedIdRef.current && lastClickedIdRef.current !== id) {
      const ids = items.map((i) => i.id);
      const a = ids.indexOf(lastClickedIdRef.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelectedIds((current) => {
          const next = new Set(current);
          for (let i = from; i <= to; i += 1) {
            next.add(ids[i]);
          }
          return next;
        });
        lastClickedIdRef.current = id;
        return;
      }
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIdRef.current = id;
  }

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMarquee(null);
    lastClickedIdRef.current = null;
    stopAutoScroll();
  }

  function selectAllLoaded() {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleDownloadSelectedZip() {
    if (isExporting) return;
    const list = items.filter((i) => selectedIds.has(i.id));
    if (list.length === 0) return;
    setIsExporting(true);
    setMessageKey("");
    try {
      await downloadLibraryZip(list);
      setMessageKey("library.messages.zipDownloadStarted");
    } catch (error) {
      console.warn("[openai-image-webui] Failed to export ZIP", error);
      setMessageKey("library.messages.zipFailed");
    } finally {
      setIsExporting(false);
    }
  }


  async function handleLoadMore() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setMessageKey("");

    try {
      const page = await listCachedImages(items.length, PAGE_SIZE);
      setItems((current) => [...current, ...page.images.map(toLibraryImage)]);
      setHasMore(page.hasMore);
      updateViewport();
    } catch (error) {
      console.warn("[openai-image-webui] Failed to load more images", error);
      setMessageKey("library.messages.loadFailed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyPrompt(item: LibraryImage) {
    await copyText(item.prompt || "");
    setMessageKey("library.messages.promptCopied");
  }

  async function handleDownload(item: LibraryImage) {
    await downloadImage(item.objectUrl, `openai-image-${item.id.slice(0, 8)}`, item.mimeType);
    setMessageKey("library.messages.downloadStarted");
  }

  const handlePreview = useCallback(
    (imageUrl: string) => onPreview(imageUrl, items.map((item) => item.objectUrl)),
    [items, onPreview],
  );

  // Confirmation happens in the AlertDialog below; this runs once the user confirms.
  function handleDelete(item: LibraryImage) {
    revokeObjectUrl(item.objectUrl);
    onDeleteImage(item.id);
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setMessageKey("library.messages.imageDeleted");
    // Keep the "new images" counter aligned with what we actually show, so a
    // deletion does not look like an incoming image.
    setLoadedCount((current) => (current === null ? current : Math.max(0, current - 1)));
  }

  function handleClearAll() {
    clearObjectUrls();
    setItems([]);
    setHasMore(false);
    onClearImageCache();
    setMessageKey("library.messages.cacheCleared");
    setLoadedCount(0);
  }

  async function handleReuseFromLibrary(item: LibraryImage) {
    const inputs = await getCachedInputs(item.id).catch(() => null);
    const payload: ReuseParamsPayload = {
      model: item.model || "",
      prompt: item.prompt || "",
      size: item.generationSize || "1024x1024",
      responseFormat: (item.responseFormat as "url" | "b64_json") || "b64_json",
      extraParams: item.extraParams,
      inputImages: inputs ? await Promise.all(inputs.images.map((file) => toInputImageFile(file))) : undefined,
      maskImage: inputs?.mask ? await toInputImageFile(inputs.mask) : null,
      // Records cached before inputs were persisted can't tell whether they
      // were edits, so don't claim anything was lost.
      inputImagesLost: false,
    };
    onReuseParams(payload);
  }

  const isErrorMessage = messageKey === "library.messages.loadFailed" || messageKey === "library.messages.zipFailed";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ImageCacheSummary stats={stats} onClear={handleClearAll} />
        {items.length > 0 && !selectionMode ? (
          <Button variant="outline" size="sm" className="h-8" onClick={enterSelectionMode}>
            <ListChecks aria-hidden="true" />
            {t("library.selection.enter")}
          </Button>
        ) : null}
      </div>

      {items.length > 0 && selectionMode ? (
        <div className="space-y-1.5 rounded-lg border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className="mr-1 font-mono text-xs font-medium tabular-nums">
              {t("library.selection.count", { count: selectedIds.size })}
            </span>
            <Button variant="ghost" size="sm" className="h-8" onClick={selectAllLoaded}>
              {t("library.selection.selectAll")}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" disabled={selectedIds.size === 0} onClick={clearSelection}>
              {t("library.selection.clear")}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="brand"
                size="sm"
                className="h-8"
                disabled={selectedIds.size === 0 || isExporting}
                onClick={() => void handleDownloadSelectedZip()}
              >
                {isExporting ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {isExporting
                  ? t("library.selection.zipPacking")
                  : t("library.selection.downloadZip", { count: selectedIds.size })}
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exitSelectionMode}>
                {t("library.selection.exit")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("library.selection.hint")}</p>
        </div>
      ) : null}

      {pendingNewCount > 0 ? (
        <Button
          variant="outline"
          className="w-full justify-start bg-muted/60 font-normal"
          disabled={isLoading}
          onClick={() => void refreshLibrary()}
        >
          <RefreshCw aria-hidden="true" className={cn("text-muted-foreground", isLoading && "animate-spin")} />
          {t("library.newImages", { count: pendingNewCount })}
        </Button>
      ) : null}

      {messageKey ? (
        isErrorMessage ? (
          <Notice variant="error">{t(messageKey)}</Notice>
        ) : (
          <p role="status" className="text-xs text-muted-foreground">
            {t(messageKey)}
          </p>
        )
      ) : null}

      {items.length === 0 ? (
        isLoading ? (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            aria-busy="true"
            aria-label={t("library.loading")}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="rounded-lg" style={{ height: VIRTUAL_ROW_HEIGHT }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
            <Images aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">{t("library.empty")}</p>
          </div>
        )
      ) : (
        <>
          <div
            ref={virtualGridRef}
            className={cn("relative", selectionMode && "select-none")}
            style={{ height: virtualGrid.totalHeight }}
            onMouseDown={handleGridMouseDown}
          >
            {virtualGrid.rows.map((row) => (
              <div
                key={row.rowIndex}
                className="absolute left-0 grid w-full"
                style={{
                  top: row.rowIndex * (VIRTUAL_ROW_HEIGHT + GRID_GAP),
                  height: VIRTUAL_ROW_HEIGHT,
                  gap: GRID_GAP,
                  gridTemplateColumns: `repeat(${virtualGrid.columnCount}, minmax(0, 1fr))`,
                }}
              >
                {row.items.map((item) => {
                  const isSelected = selectedIds.has(item.id) || (previewSelection ? previewSelection.has(item.id) : false);
                  return (
                    <ImageCard
                      key={item.id}
                      item={item}
                      isSelected={isSelected}
                      selectionMode={selectionMode}
                      t={t}
                      onPreview={handlePreview}
                      onDownload={handleDownload}
                      onCopyPrompt={handleCopyPrompt}
                      onReuse={handleReuseFromLibrary}
                      onEdit={onEditImage}
                      onDelete={setPendingDelete}
                      onToggleSelect={toggleSelectOne}
                    />
                  );
                })}
              </div>
            ))}
            {marquee ? (
              <div
                className="pointer-events-none absolute z-20 rounded-sm border border-brand bg-brand/10"
                style={{
                  left: Math.min(marquee.startX, marquee.currentX),
                  top: Math.min(marquee.startY, marquee.currentY),
                  width: Math.abs(marquee.currentX - marquee.startX),
                  height: Math.abs(marquee.currentY - marquee.startY),
                }}
              />
            ) : null}
          </div>

          {hasMore ? (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void handleLoadMore()}>
                {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {isLoading ? t("library.loading") : t("library.loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks.actions.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("library.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tasks.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) {
                  handleDelete(pendingDelete);
                }
              }}
            >
              {t("tasks.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
});

interface ImageCardProps {
  item: LibraryImage;
  isSelected: boolean;
  selectionMode: boolean;
  t: (key: string, options?: any) => string;
  onPreview: (url: string) => void;
  onDownload: (item: LibraryImage) => void;
  onCopyPrompt: (item: LibraryImage) => void;
  onReuse: (item: LibraryImage) => void;
  onEdit: (imageUrl: string) => void;
  onDelete: (item: LibraryImage) => void;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
}

const ImageCard = memo(function ImageCard({
  item,
  isSelected,
  selectionMode,
  t,
  onPreview,
  onDownload,
  onCopyPrompt,
  onReuse,
  onEdit,
  onDelete,
  onToggleSelect,
}: ImageCardProps) {
  const prompt = item.prompt || t("library.unknownPrompt");

  const onCardClick = selectionMode
    ? (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect(item.id, e);
      }
    : undefined;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow]",
        isSelected && "border-brand ring-2 ring-brand",
        selectionMode && "cursor-pointer select-none",
      )}
      onClickCapture={onCardClick}
      onMouseDownCapture={selectionMode ? (e) => e.stopPropagation() : undefined}
    >
      <div className="relative min-h-0 flex-1 bg-muted">
        <button
          type="button"
          className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => onPreview(item.objectUrl)}
          aria-label={`${t("library.previewImage")}: ${prompt}`}
          tabIndex={selectionMode ? -1 : 0}
        >
          <img
            className="size-full object-cover"
            src={item.objectUrl}
            alt=""
            loading="lazy"
            draggable={false}
          />
        </button>

        {selectionMode ? (
          // Space on the checkbox fires a click, which the article's capture handler turns into a toggle.
          <Checkbox
            checked={isSelected}
            aria-label={prompt}
            className="absolute left-2 top-2 size-5 border-input bg-background data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground"
          />
        ) : (
          <div className="absolute right-2 top-2 flex gap-1 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:hover)]:opacity-0">
            <TileAction label={t("tasks.actions.download")} onClick={() => void onDownload(item)}>
              <Download aria-hidden="true" />
            </TileAction>
            <TileAction label={t("tasks.actions.reuseParams")} onClick={() => void onReuse(item)}>
              <RotateCcw aria-hidden="true" />
            </TileAction>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="size-7 bg-background" aria-label={t("tasks.actions.more")}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("tasks.actions.more")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem disabled={!item.prompt} onSelect={() => void onCopyPrompt(item)}>
                  <Copy aria-hidden="true" />
                  {t("tasks.actions.copyPrompt")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(item.objectUrl)}>
                  <Pencil aria-hidden="true" />
                  {t("tasks.actions.editImage")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive-soft focus:text-destructive"
                  onSelect={() => onDelete(item)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("tasks.actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t px-2.5 py-2">
        <p className="truncate text-sm" title={prompt}>
          {prompt}
        </p>
        <dl className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-muted-foreground">
          <dt className="sr-only">{t("tasks.fields.model")}</dt>
          <dd className="min-w-0 truncate" title={item.model || t("library.unknownModel")}>
            {item.model || t("library.unknownModel")}
          </dd>
          <dt className="sr-only">{t("tasks.fields.size")}</dt>
          <dd className="shrink-0">{item.generationSize || "-"}</dd>
        </dl>
        <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="min-w-0 truncate" title={new Date(item.taskCreatedAt || item.cachedAt).toLocaleString()}>
            {new Date(item.taskCreatedAt || item.cachedAt).toLocaleDateString()}
          </span>
          <span className="shrink-0">{formatBytes(item.blob.size)}</span>
        </div>
      </div>
    </article>
  );
});

function TileAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className="size-7 bg-background" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

