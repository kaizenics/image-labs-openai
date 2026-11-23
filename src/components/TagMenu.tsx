import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "lucide-react";
import { normalizeTag } from "../hooks/useImageTags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip } from "./Chip";

interface TagMenuProps {
  allTags: string[];
  /** Tags that every selected image already has. */
  appliedTags: Set<string>;
  disabled: boolean;
  onToggle: (tag: string) => void;
}

/** Add or remove tags on the current selection. */
export function TagMenu({ allTags, appliedTags, disabled, onToggle }: TagMenuProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function submit() {
    const name = normalizeTag(draft);
    if (name && !appliedTags.has(name)) onToggle(name);
    setDraft("");
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={disabled}>
          <Tag aria-hidden="true" />
          {t("library.tags.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            value={draft}
            maxLength={24}
            placeholder={t("library.tags.new")}
            aria-label={t("library.tags.new")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!normalizeTag(draft)}>
            {t("library.tags.add")}
          </Button>
        </form>
        {allTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <Chip key={tag} active={appliedTags.has(tag)} onClick={() => onToggle(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("library.tags.none")}</p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">{t("library.tags.hint")}</p>
      </PopoverContent>
    </Popover>
  );
}
