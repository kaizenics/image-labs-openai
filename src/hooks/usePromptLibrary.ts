import { useCallback } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorage } from "./useLocalStorage";

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
  size: string;
  advancedJson: string;
}

const HISTORY_LIMIT = 30;
const NAME_LIMIT = 40;

/** Recent prompts plus named presets (prompt + size + advanced JSON), kept in localStorage. */
export function usePromptLibrary() {
  const [rawHistory, setHistory] = useLocalStorage<string[]>(STORAGE_KEYS.promptHistory, []);
  const [rawPresets, setPresets] = useLocalStorage<PromptPreset[]>(STORAGE_KEYS.promptPresets, []);
  // Guard against hand-edited or corrupt storage.
  const history = Array.isArray(rawHistory) ? rawHistory.filter((item) => typeof item === "string") : [];
  const presets = Array.isArray(rawPresets) ? rawPresets.filter((item) => item && typeof item.prompt === "string") : [];

  const recordPrompt = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text) return;
      setHistory((current) =>
        [text, ...(Array.isArray(current) ? current : []).filter((item) => item !== text)].slice(0, HISTORY_LIMIT),
      );
    },
    [setHistory],
  );

  const removeFromHistory = useCallback(
    (prompt: string) => setHistory((current) => (Array.isArray(current) ? current : []).filter((item) => item !== prompt)),
    [setHistory],
  );

  const savePreset = useCallback(
    (preset: Omit<PromptPreset, "id" | "name">) => {
      const text = preset.prompt.trim();
      if (!text) return false;
      const name = text.length > NAME_LIMIT ? `${text.slice(0, NAME_LIMIT)}…` : text;
      setPresets((current) => [{ ...preset, prompt: text, id: crypto.randomUUID(), name }, ...(Array.isArray(current) ? current : [])]);
      return true;
    },
    [setPresets],
  );

  const removePreset = useCallback(
    (id: string) => setPresets((current) => (Array.isArray(current) ? current : []).filter((item) => item.id !== id)),
    [setPresets],
  );

  return { history, presets, recordPrompt, removeFromHistory, savePreset, removePreset };
}
