import type { Project } from "@/types/project";

const AUTOSAVE_KEY = "yokozuna.autosave.v1";
const RECENT_KEY = "yokozuna.recent.v1";
const PREFS_KEY = "yokozuna.prefs.v1";

/** Soft cap so large base64 assets do not blow localStorage. */
const MAX_JSON_BYTES = 2.8 * 1024 * 1024;
const RECENT_LIMIT = 12;

export type AutosavePayload = {
  savedAt: string;
  project: Project;
};

export type RecentEntry = {
  id: string;
  name: string;
  modifiedAt: string;
  /** True when a full project snapshot is stored and can be reopened offline. */
  hasSnapshot: boolean;
};

type RecentStore = {
  entries: RecentEntry[];
  snapshots: Record<string, Project>;
};

export type PersistencePrefs = {
  autosaveEnabled: boolean;
  /** Debounce ms after last edit (default 2500). */
  autosaveDelayMs: number;
};

const DEFAULT_PREFS: PersistencePrefs = {
  autosaveEnabled: true,
  autosaveDelayMs: 2500,
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function byteLength(json: string): number {
  return new Blob([json]).size;
}

export function getPersistencePrefs(): PersistencePrefs {
  const parsed = safeParse<Partial<PersistencePrefs>>(
    localStorage.getItem(PREFS_KEY),
  );
  return {
    autosaveEnabled: parsed?.autosaveEnabled ?? DEFAULT_PREFS.autosaveEnabled,
    autosaveDelayMs:
      typeof parsed?.autosaveDelayMs === "number" && parsed.autosaveDelayMs >= 500
        ? parsed.autosaveDelayMs
        : DEFAULT_PREFS.autosaveDelayMs,
  };
}

export function setPersistencePrefs(partial: Partial<PersistencePrefs>): void {
  const next = { ...getPersistencePrefs(), ...partial };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function loadAutosave(): AutosavePayload | null {
  try {
    const data = safeParse<AutosavePayload>(localStorage.getItem(AUTOSAVE_KEY));
    if (!data?.project || !data.savedAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Write autosave draft. Returns false if skipped (disabled / too large / error).
 */
export function writeAutosave(project: Project): boolean {
  if (!getPersistencePrefs().autosaveEnabled) return false;
  try {
    const payload: AutosavePayload = {
      savedAt: new Date().toISOString(),
      project,
    };
    const json = JSON.stringify(payload);
    if (byteLength(json) > MAX_JSON_BYTES) {
      // Try without asset payloads (keep structure, drop heavy src)
      const slim: Project = {
        ...project,
        assets: Object.fromEntries(
          Object.entries(project.assets).map(([id, a]) => [
            id,
            {
              ...a,
              src:
                typeof a.src === "string" && a.src.startsWith("data:")
                  ? ""
                  : a.src,
            },
          ]),
        ),
      };
      const slimPayload: AutosavePayload = {
        savedAt: payload.savedAt,
        project: slim,
      };
      const slimJson = JSON.stringify(slimPayload);
      if (byteLength(slimJson) > MAX_JSON_BYTES) return false;
      localStorage.setItem(AUTOSAVE_KEY, slimJson);
      return true;
    }
    localStorage.setItem(AUTOSAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

function readRecentStore(): RecentStore {
  const data = safeParse<RecentStore>(localStorage.getItem(RECENT_KEY));
  if (!data || !Array.isArray(data.entries)) {
    return { entries: [], snapshots: {} };
  }
  return {
    entries: data.entries,
    snapshots: data.snapshots ?? {},
  };
}

function writeRecentStore(store: RecentStore): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(store));
  } catch {
    /* drop snapshots and retry metadata only */
    try {
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify({ entries: store.entries, snapshots: {} }),
      );
    } catch {
      /* ignore */
    }
  }
}

export function listRecentProjects(): RecentEntry[] {
  return readRecentStore().entries;
}

export function loadRecentSnapshot(id: string): Project | null {
  const store = readRecentStore();
  return store.snapshots[id] ?? null;
}

/**
 * Push or update a recent project entry after open / manual save.
 */
export function pushRecentProject(project: Project, displayName?: string): void {
  const name =
    (displayName || project.meta.name || "無題のプロジェクト").trim() ||
    "無題のプロジェクト";
  const id =
    project.meta.createdAt && project.meta.name
      ? `p:${project.meta.createdAt}:${name}`
      : `p:${name}:${project.meta.modifiedAt || Date.now()}`;

  const store = readRecentStore();
  const entries = store.entries.filter((e) => e.id !== id && e.name !== name);
  let hasSnapshot = false;
  const snapshots = { ...store.snapshots };

  try {
    const json = JSON.stringify(project);
    if (byteLength(json) <= MAX_JSON_BYTES) {
      snapshots[id] = project;
      hasSnapshot = true;
    } else {
      delete snapshots[id];
    }
  } catch {
    delete snapshots[id];
  }

  entries.unshift({
    id,
    name,
    modifiedAt: project.meta.modifiedAt || new Date().toISOString(),
    hasSnapshot,
  });

  // Cap list and prune orphan snapshots
  const capped = entries.slice(0, RECENT_LIMIT);
  const keep = new Set(capped.map((e) => e.id));
  for (const key of Object.keys(snapshots)) {
    if (!keep.has(key)) delete snapshots[key];
  }

  writeRecentStore({ entries: capped, snapshots });
}

export function removeRecentProject(id: string): void {
  const store = readRecentStore();
  delete store.snapshots[id];
  writeRecentStore({
    entries: store.entries.filter((e) => e.id !== id),
    snapshots: store.snapshots,
  });
}

export function clearRecentProjects(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Cheap fingerprint to detect "empty new project" vs restored draft. */
export function projectFingerprint(project: Project): string {
  try {
    return `${project.meta.name}|${project.meta.modifiedAt}|${Object.keys(project.compositions).length}|${Object.keys(project.assets).length}`;
  } catch {
    return String(Date.now());
  }
}
