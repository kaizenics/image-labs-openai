import { useTranslation } from "react-i18next";
import { HardDrive, Trash2, TriangleAlert } from "lucide-react";
import type { ImageCacheStats } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ImageCacheSummaryProps {
  stats: ImageCacheStats;
  onClear: () => void;
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

export function ImageCacheSummary({ stats, onClear }: ImageCacheSummaryProps) {
  const { t } = useTranslation();
  const usage = stats.warningBytes > 0 ? Math.min(100, (stats.size / stats.warningBytes) * 100) : 0;

  function handleClear() {
    if (stats.count <= 0) {
      return;
    }

    onClear();
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <HardDrive aria-hidden="true" className="size-3.5" />
        {t("tasks.cache.title")}
      </span>
      <span className="font-mono tabular-nums text-foreground">
        {t("tasks.cache.summary", {
          count: stats.count,
          size: formatBytes(stats.size),
        })}
      </span>
      <Progress
        value={usage}
        aria-label={t("tasks.cache.title")}
        className={cn("h-1 w-20 bg-muted", stats.overWarning ? "[&>div]:bg-warning" : "[&>div]:bg-brand")}
      />
      {stats.overWarning ? (
        <span role="status" className="inline-flex items-center gap-1 text-warning">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {t("tasks.cache.warning")}
        </span>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={stats.count <= 0}
          >
            <Trash2 aria-hidden="true" className="!size-3.5" />
            {t("tasks.cache.clear")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks.cache.clear")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tasks.cache.clearConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tasks.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClear}
            >
              {t("tasks.cache.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
