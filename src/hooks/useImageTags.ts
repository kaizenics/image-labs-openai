import { useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorage } from "./useLocalStorage";

const TAG_LIMIT = 24;

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().slice(0, TAG_LIMIT);
}

/** Free-form tags per library image id, kept in localStorage. */
export function useImageTags() {
  const [raw, setRaw] = useLocalStorage<Record<string, string[]>>(STORAGE_KEYS.imageTags, {});
  // Guard against hand-edited or corrupt storage.
  const tagsById = useMemo<Record<string, string[]>>(
    () => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
    [raw],
  );
  const allTags = useMemo(() => [...new Set(Object.values(tagsById).flat())].sort(), [tagsById]);

  /** Adds the tag to every id, or removes it from all of them when they all already have it. */
  const toggleTag = useCallback(
    (ids: string[], tag: string) => {
      const name = normalizeTag(tag);
      if (!name || ids.length === 0) return;
      setRaw((current) => {
        const next = { ...current };
        const allHave = ids.every((id) => next[id]?.includes(name));
        for (const id of ids) {
          const tags = (next[id] ?? []).filter((item) => item !== name);
          if (!allHave) tags.push(name);
          if (tags.length) next[id] = tags;
          else delete next[id];
        }
        return next;
      });
    },
    [setRaw],
  );

  const forgetImages = useCallback(
    (ids: string[]) =>
      setRaw((current) => {
        const next = { ...current };
        for (const id of ids) delete next[id];
        return next;
      }),
    [setRaw],
  );

  return { tagsById, allTags, toggleTag, forgetImages };
}
