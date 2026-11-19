import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearStorageIssues,
  getStorageIssues,
  subscribeStorageIssues,
  type StorageIssue,
} from "../lib/storageHealth";

/**
 * Surfaces persistence failures that would otherwise be invisible.
 * Without this the app keeps looking healthy while silently losing data.
 */
export const StorageHealthBanner = memo(function StorageHealthBanner() {
  const { t } = useTranslation();
  const [issues, setIssues] = useState<StorageIssue[]>(getStorageIssues);

  useEffect(() => subscribeStorageIssues(setIssues), []);

  if (issues.length === 0) {
    return null;
  }

  return (
    <div role="alert" className="border-b border-warning/30 bg-warning-soft">
      <div className="flex items-start gap-3 px-4 py-3 text-sm md:px-6">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("storageHealth.title")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {issues.map((issue) => (
              <li key={issue.kind}>
                {t(`storageHealth.${issue.kind}`)}
                {issue.detail ? <span className="ml-1 font-mono text-xs">({issue.detail})</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={clearStorageIssues}>
          {t("storageHealth.dismiss")}
        </Button>
      </div>
    </div>
  );
});
