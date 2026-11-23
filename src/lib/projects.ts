/**
 * Projects keep tasks, library, prompts and tags apart. Settings (API key) stay shared.
 *
 * The active project is read once at load and switching reloads the page, so every storage key and
 * the IndexedDB name below can be resolved at module load. The default project keeps the original
 * unsuffixed keys, so existing data needs no migration.
 */
const PROJECTS_KEY = "openai-image-webui:projects";
export const DEFAULT_PROJECT_ID = "default";
export const CACHE_DB_BASE_NAME = "openai-image-webui-cache";

/** localStorage keys that belong to a project. */
export const PROJECT_KEYS = {
  tasks: "openai-image-webui:tasks",
  batchPrompts: "openai-image-webui:batch-prompts",
  currentBatchId: "openai-image-webui:current-batch-id",
  promptHistory: "openai-image-webui:prompt-history",
  promptPresets: "openai-image-webui:prompt-presets",
  imageTags: "openai-image-webui:image-tags",
  recentSizes: "openai-image-webui:recent-sizes",
} as const;

export interface Project {
  id: string;
  name: string;
}

interface ProjectsState {
  active: string;
  list: Project[];
}

const NAME_LIMIT = 40;

function sanitize(raw: unknown): ProjectsState {
  const stored = raw as Partial<ProjectsState> | null;
  const list: Project[] = [{ id: DEFAULT_PROJECT_ID, name: "Default" }];

  if (Array.isArray(stored?.list)) {
    for (const item of stored.list) {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const name = item.name.trim().slice(0, NAME_LIMIT);
      if (item.id === DEFAULT_PROJECT_ID) {
        if (name) list[0].name = name;
      } else if (/^[\w-]{1,40}$/.test(item.id) && !list.some((project) => project.id === item.id)) {
        list.push({ id: item.id, name: name || item.id });
      }
    }
  }

  const active = list.some((project) => project.id === stored?.active) ? (stored!.active as string) : DEFAULT_PROJECT_ID;
  return { active, list };
}

export function loadProjects(): ProjectsState {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitize(null);
  }
}

function saveProjects(state: ProjectsState) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(state));
  } catch {
    // Without persistence the switch simply does not stick; nothing else to do.
  }
}

export const activeProjectId = loadProjects().active;

function suffixed(name: string, projectId: string) {
  return projectId === DEFAULT_PROJECT_ID ? name : `${name}@${projectId}`;
}

/** The storage key / database name for the active project. */
export const scopedKey = (name: string) => suffixed(name, activeProjectId);

function activate(state: ProjectsState, id: string) {
  saveProjects({ ...state, active: id });
  window.location.reload();
}

export function switchProject(id: string) {
  const state = loadProjects();
  if (state.list.some((project) => project.id === id)) activate(state, id);
}

export function createProject(name: string) {
  const state = loadProjects();
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  activate({ ...state, list: [...state.list, { id, name: name.trim().slice(0, NAME_LIMIT) || "Project" }] }, id);
}

export function renameProject(id: string, name: string) {
  const state = loadProjects();
  const trimmed = name.trim().slice(0, NAME_LIMIT);
  if (!trimmed) return;
  saveProjects({ ...state, list: state.list.map((project) => (project.id === id ? { ...project, name: trimmed } : project)) });
}

/** Removes a project and its data, then reloads onto the default project. The default project cannot be deleted. */
export function deleteProject(id: string) {
  if (id === DEFAULT_PROJECT_ID) return;
  const state = loadProjects();
  try {
    for (const key of Object.values(PROJECT_KEYS)) localStorage.removeItem(suffixed(key, id));
    // Queued until the page's own connection closes on reload.
    indexedDB.deleteDatabase(suffixed(CACHE_DB_BASE_NAME, id));
  } catch {
    // Best effort: leftovers are only unreachable storage.
  }
  activate({ ...state, list: state.list.filter((project) => project.id !== id) }, DEFAULT_PROJECT_ID);
}
