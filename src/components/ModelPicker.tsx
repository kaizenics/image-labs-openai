import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM = "__custom__";

export interface ModelOption {
  id: string;
  /** Short note shown next to the id, e.g. "newest" or the owner. */
  note?: string;
}

interface ModelPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Curated OpenAI models. */
  presets: ModelOption[];
  /** Models returned by "Fetch models" for the current endpoint, if any. */
  fetched?: ModelOption[];
  labels: { presets: string; fetched: string; custom: string; customPlaceholder: string };
  /** Injected by Field so the hint/error are announced with the control. */
  "aria-describedby"?: string;
}

/** Pick a known model, or switch to a free-text input for any other model id. */
export function ModelPicker({ id, value, onChange, presets, fetched = [], labels, "aria-describedby": describedBy }: ModelPickerProps) {
  const presetIds = new Set(presets.map((option) => option.id));
  const fetchedOnly = fetched.filter((option) => !presetIds.has(option.id));
  const isKnown = presetIds.has(value) || fetchedOnly.some((option) => option.id === value);
  // A saved model that is not in either list opens straight in custom mode, so nothing is lost.
  const [custom, setCustom] = useState(() => !!value && !isKnown);

  useEffect(() => {
    if (value && !isKnown) setCustom(true);
  }, [value, isKnown]);

  return (
    <div className="grid gap-2">
      <Select
        value={custom ? CUSTOM : value || undefined}
        onValueChange={(next) => {
          if (next === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(next);
        }}
      >
        <SelectTrigger id={id} className="font-mono" aria-describedby={describedBy}>
          <SelectValue placeholder={labels.customPlaceholder} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectGroup>
            <SelectLabel className="text-xs font-normal text-muted-foreground">{labels.presets}</SelectLabel>
            {presets.map((option) => (
              <SelectItem key={option.id} value={option.id} className="font-mono">
                {option.id}
                {option.note ? <span className="ml-2 font-sans text-xs text-muted-foreground">{option.note}</span> : null}
              </SelectItem>
            ))}
          </SelectGroup>
          {fetchedOnly.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-xs font-normal text-muted-foreground">{labels.fetched}</SelectLabel>
                {fetchedOnly.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="font-mono">
                    {option.id}
                    {option.note ? <span className="ml-2 font-sans text-xs text-muted-foreground">{option.note}</span> : null}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>{labels.custom}</SelectItem>
        </SelectContent>
      </Select>

      {custom ? (
        <Input
          aria-label={labels.custom}
          aria-describedby={describedBy}
          className="font-mono"
          spellCheck={false}
          autoFocus={!value}
          placeholder={labels.customPlaceholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
