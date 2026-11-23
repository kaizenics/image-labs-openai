import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import { BackupError, exportBackup, importBackup, previewBackup } from "../lib/backup";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Export or restore the active project's data as one ZIP. */
export function BackupSection() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; replacesCredentials: string | null } | null>(null);

  async function handleExport() {
    setBusy("export");
    try {
      const { images } = await exportBackup({ includeApiKey, includeImages });
      toast.success(t("backup.exported", { count: images }));
    } catch {
      toast.error(t("backup.exportFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File) {
    setBusy("import");
    try {
      const { images } = await importBackup(file);
      toast.success(t("backup.imported", { count: images }));
      // Reload so every hook re-reads what was just restored.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      toast.error(error instanceof BackupError ? error.message : t("backup.importFailed"));
      setBusy(null);
    }
  }

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPendingFile({ file, ...(await previewBackup(file)) });
    } catch (error) {
      toast.error(error instanceof BackupError ? error.message : t("backup.importFailed"));
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-labelledby="backup-heading">
      <div>
        <h3 id="backup-heading" className="text-sm font-medium">{t("backup.title")}</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("backup.description")}</p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id="backup-images" checked={includeImages} onCheckedChange={(value) => setIncludeImages(value === true)} />
          <Label htmlFor="backup-images" className="text-xs font-normal">{t("backup.includeImages")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="backup-key" checked={includeApiKey} onCheckedChange={(value) => setIncludeApiKey(value === true)} />
          <Label htmlFor="backup-key" className="text-xs font-normal">{t("backup.includeApiKey")}</Label>
        </div>
        {includeApiKey ? <p className="text-xs leading-5 text-warning">{t("backup.apiKeyWarning")}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void handleExport()}>
          {busy === "export" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
          {t("backup.export")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
          {busy === "import" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
          {t("backup.import")}
        </Button>
        <input ref={fileInputRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => void onFileChosen(event)} />
      </div>

      <AlertDialog open={pendingFile !== null} onOpenChange={(open) => !open && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("backup.import")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("backup.importConfirm", { name: pendingFile?.file.name ?? "" })}
              {pendingFile?.replacesCredentials
                ? ` ${t("backup.credentialsWarning", { url: pendingFile.replacesCredentials })}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingFile) void handleImport(pendingFile.file);
              }}
            >
              {t("backup.import")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
