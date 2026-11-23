import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_PROJECT_ID,
  activeProjectId,
  createProject,
  deleteProject,
  loadProjects,
  renameProject,
  switchProject,
} from "../lib/projects";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type NameDialog = "new" | "rename" | null;

/** Header dropdown to switch, create, rename and delete projects. Switching reloads the page. */
export function ProjectMenu() {
  const { t } = useTranslation();
  const [{ list }, setState] = useState(loadProjects);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = list.find((project) => project.id === activeProjectId) ?? list[0];

  function openNameDialog(kind: Exclude<NameDialog, null>) {
    setName(kind === "rename" ? active.name : "");
    setNameDialog(kind);
  }

  function submitName(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (nameDialog === "new") {
      createProject(name);
      return;
    }
    renameProject(active.id, name);
    setState(loadProjects());
    setNameDialog(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 max-w-[11rem] gap-1.5 px-2" aria-label={`${t("projects.label")}: ${active.name}`}>
            <FolderKanban aria-hidden="true" />
            <span className="hidden truncate text-xs sm:inline">{active.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("projects.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={active.id}
            onValueChange={(id) => id !== active.id && switchProject(id)}
          >
            {list.map((project) => (
              <DropdownMenuRadioItem key={project.id} value={project.id}>
                <span className="truncate">{project.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openNameDialog("new")}>
            <Plus aria-hidden="true" />
            {t("projects.new")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openNameDialog("rename")}>
            <Pencil aria-hidden="true" />
            {t("projects.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={active.id === DEFAULT_PROJECT_ID}
            className="text-destructive focus:bg-destructive-soft focus:text-destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden="true" />
            {t("projects.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent className="max-w-sm">
          <form onSubmit={submitName} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{nameDialog === "new" ? t("projects.new") : t("projects.rename")}</DialogTitle>
              <DialogDescription>{nameDialog === "new" ? t("projects.newHint") : t("projects.renameHint")}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={name}
              maxLength={40}
              aria-label={t("projects.name")}
              placeholder={t("projects.name")}
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNameDialog(null)}>
                {t("app.cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                {nameDialog === "new" ? t("projects.create") : t("projects.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projects.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("projects.deleteConfirm", { name: active.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProject(active.id)}
            >
              {t("projects.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
