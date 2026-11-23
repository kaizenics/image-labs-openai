import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookMarked, Plus, X } from "lucide-react";
import type { PromptPreset } from "../hooks/usePromptLibrary";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PromptLibraryProps {
  history: string[];
  presets: PromptPreset[];
  /** Whether the current form has a prompt that can be saved. */
  canSave: boolean;
  onApplyPrompt: (prompt: string) => void;
  onApplyPreset: (preset: PromptPreset) => void;
  onSave: () => void;
  onRemovePreset: (id: string) => void;
  onRemoveHistory: (prompt: string) => void;
}

function Row({ label, title, removeLabel, onPick, onRemove }: {
  label: string;
  title: string;
  removeLabel: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-1 rounded-sm hover:bg-accent">
      <button
        type="button"
        title={title}
        className="min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onPick}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={`${removeLabel}: ${label}`}
        className="mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRemove}
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </li>
  );
}

export function PromptLibrary({ history, presets, canSave, onApplyPrompt, onApplyPreset, onSave, onRemovePreset, onRemoveHistory }: PromptLibraryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs">
          <BookMarked aria-hidden="true" className="!size-3.5" />
          {t("generation.promptLibrary.open")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <Button type="button" variant="outline" size="sm" className="mb-1 w-full justify-start" disabled={!canSave} onClick={onSave}>
          <Plus aria-hidden="true" />
          {t("generation.promptLibrary.save")}
        </Button>
        <p className="mb-2 px-1 text-xs text-muted-foreground">{t("generation.promptLibrary.saveHint")}</p>

        <ScrollArea className="max-h-72">
          <section aria-label={t("generation.promptLibrary.presets")} className="mb-2">
            <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{t("generation.promptLibrary.presets")}</h3>
            {presets.length ? (
              <ul>
                {presets.map((preset) => (
                  <Row
                    key={preset.id}
                    label={preset.name}
                    title={`${preset.prompt} · ${preset.size}`}
                    removeLabel={t("generation.promptLibrary.remove")}
                    onPick={() => { onApplyPreset(preset); setOpen(false); }}
                    onRemove={() => onRemovePreset(preset.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("generation.promptLibrary.emptyPresets")}</p>
            )}
          </section>

          <section aria-label={t("generation.promptLibrary.recent")}>
            <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{t("generation.promptLibrary.recent")}</h3>
            {history.length ? (
              <ul>
                {history.map((prompt) => (
                  <Row
                    key={prompt}
                    label={prompt}
                    title={prompt}
                    removeLabel={t("generation.promptLibrary.remove")}
                    onPick={() => { onApplyPrompt(prompt); setOpen(false); }}
                    onRemove={() => onRemoveHistory(prompt)}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t("generation.promptLibrary.emptyRecent")}</p>
            )}
          </section>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
