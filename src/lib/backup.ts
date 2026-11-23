import JSZip from "jszip";
import { listCachedImages, saveCachedImage, type CachedImageRecord } from "./imageCache";
import { loadProjects, activeProjectId } from "./projects";
import { STORAGE_KEYS } from "./storage";

const BACKUP_APP = "image-labs-openai";
const BACKUP_VERSION = 1;
const PAGE = 50;

type StorageName = keyof typeof STORAGE_KEYS;

interface BackupFile {
  app: string;
  version: number;
  exportedAt: number;
  project: string;
  /** Raw localStorage strings by STORAGE_KEYS name, so a backup restores into any project. */
  storage: Partial<Record<StorageName, string>>;
}

export interface BackupOptions {
  includeApiKey: boolean;
  includeImages: boolean;
}

export class BackupError extends Error {}

function extension(mime: string) {
  return mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
}

/** Recorded without file blobs: reference inputs are not part of a backup, so "reuse params" loses them after a restore. */
function toMeta(record: CachedImageRecord) {
  const { blob: _blob, inputImages: _inputs, inputMask: _mask, inputsFromId: _from, ...meta } = record;
  return meta;
}

export async function exportBackup({ includeApiKey, includeImages }: BackupOptions) {
  const storage: BackupFile["storage"] = {};
  for (const name of Object.keys(STORAGE_KEYS) as StorageName[]) {
    const raw = localStorage.getItem(STORAGE_KEYS[name]);
    if (raw === null) continue;
    if (name === "settings" && !includeApiKey) {
      try {
        storage[name] = JSON.stringify({ ...JSON.parse(raw), apiKey: "" });
        continue;
      } catch {
        continue;
      }
    }
    storage[name] = raw;
  }

  const projectName = loadProjects().list.find((project) => project.id === activeProjectId)?.name ?? "project";
  const zip = new JSZip();
  const backup: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), project: projectName, storage };
  zip.file("backup.json", JSON.stringify(backup));

  let images = 0;
  if (includeImages) {
    for (let offset = 0, more = true; more; offset += PAGE) {
      const page = await listCachedImages(offset, PAGE);
      more = page.hasMore;
      for (const record of page.images) {
        zip.file(`images/${record.id}.${extension(record.mimeType)}`, record.blob);
        zip.file(`images/${record.id}.json`, JSON.stringify(toMeta(record)));
        images += 1;
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `image-labs-backup-${projectName.replace(/[^\w-]+/g, "_")}-${stamp}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { images };
}

const hasId = (value: unknown): value is { id: string } =>
  !!value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string";

/** Arrays union (by `id` when items have one), objects merge shallowly with the import winning, anything else is replaced. */
function mergeValue(current: unknown, imported: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(imported)) {
    const merged = new Map<unknown, unknown>();
    for (const item of [...current, ...imported]) merged.set(hasId(item) ? item.id : JSON.stringify(item), item);
    return [...merged.values()];
  }
  if (
    current && imported && typeof current === "object" && typeof imported === "object" &&
    !Array.isArray(current) && !Array.isArray(imported)
  ) {
    return { ...current, ...imported };
  }
  return imported;
}

async function readBackup(file: File) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new BackupError("Not a backup file.");
  }

  const manifest = zip.file("backup.json");
  if (!manifest) throw new BackupError("Not an Image Labs backup (backup.json is missing).");

  let backup: BackupFile;
  try {
    backup = JSON.parse(await manifest.async("string")) as BackupFile;
  } catch {
    throw new BackupError("Backup data is unreadable.");
  }
  if (backup.app !== BACKUP_APP || typeof backup.storage !== "object" || backup.storage === null) {
    throw new BackupError("Not an Image Labs backup.");
  }
  if (backup.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of the app.");
  }

  return { zip, backup };
}

/**
 * Connection settings are only taken from a backup that carries both its own endpoint and its own key.
 * Otherwise a crafted backup could point `baseUrl` at another server while keeping the key saved here,
 * and the next request would send that key to it.
 */
function importedCredentials(settingsRaw: string | undefined) {
  try {
    const settings = JSON.parse(settingsRaw ?? "") as { apiKey?: unknown; baseUrl?: unknown };
    return typeof settings.apiKey === "string" && settings.apiKey && typeof settings.baseUrl === "string" && settings.baseUrl
      ? settings.baseUrl
      : null;
  } catch {
    return null;
  }
}

/** What restoring this file would change that the user should confirm first. */
export async function previewBackup(file: File) {
  const { backup } = await readBackup(file);
  return { replacesCredentials: importedCredentials(backup.storage.settings) };
}

export async function importBackup(file: File) {
  const { zip, backup } = await readBackup(file);
  const carriesCredentials = importedCredentials(backup.storage.settings) !== null;

  const known = new Set(Object.keys(STORAGE_KEYS));
  for (const [name, raw] of Object.entries(backup.storage)) {
    if (!known.has(name) || typeof raw !== "string") continue;
    const key = STORAGE_KEYS[name as StorageName];
    const currentRaw = localStorage.getItem(key);
    let next = raw;
    try {
      let imported = JSON.parse(raw) as unknown;
      const current = currentRaw === null ? undefined : (JSON.parse(currentRaw) as unknown);
      if (name === "settings" && imported && typeof imported === "object" && !carriesCredentials) {
        const { apiKey: _key, baseUrl: _url, ...rest } = imported as Record<string, unknown>;
        imported = rest;
      }
      next = JSON.stringify(current === undefined ? imported : mergeValue(current, imported));
    } catch {
      // Plain strings (batch prompts, batch id) are just replaced.
    }
    localStorage.setItem(key, next);
  }

  let images = 0;
  for (const path of Object.keys(zip.files)) {
    const match = /^images\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const id = match[1];
    const meta = JSON.parse(await zip.files[path].async("string")) as Omit<CachedImageRecord, "blob">;
    const imagePath = Object.keys(zip.files).find((name) => name.startsWith(`images/${id}.`) && !name.endsWith(".json"));
    if (!imagePath) continue;
    const mimeType = meta.mimeType || "image/png";
    const blob = new Blob([await zip.files[imagePath].async("blob")], { type: mimeType });
    await saveCachedImage({ ...meta, id, blob, mimeType, size: blob.size, cachedAt: meta.cachedAt ?? Date.now() });
    images += 1;
  }

  return { images };
}
