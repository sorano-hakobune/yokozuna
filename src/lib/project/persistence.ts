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

const IDB_NAME = "yokozuna-persistence-v1";
const IDB_STORE = "kv";
const IDB_AUTOSAVE_KEY = "autosave-draft";

function openPersistenceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

function idbGet<T>(key: string): Promise<T | null> {
  return openPersistenceDb()
    .then(
      (db) =>
        new Promise<T | null>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve((req.result as T) ?? null);
          req.onerror = () => reject(req.error);
        }),
    )
    .catch(() => null);
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openPersistenceDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return openPersistenceDb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    )
    .catch(() => undefined);
}

/** True if any image/audio/svg asset is missing its payload (empty src). */
export function projectHasMissingAssetData(project: Project): boolean {
  return Object.values(project.assets ?? {}).some(
    (a) =>
      (a.type === "image" || a.type === "svg" || a.type === "audio") &&
      !(typeof a.src === "string" && a.src.length > 0),
  );
}

/**
 * Sync peek used by status UI. Prefers localStorage full draft;
 * returns null for IDB-only marker (use loadAutosaveAsync for restore).
 */
export function loadAutosave(): AutosavePayload | null {
  try {
    const data = safeParse<AutosavePayload & { idb?: boolean }>(
      localStorage.getItem(AUTOSAVE_KEY),
    );
    if (!data?.savedAt) return null;
    if (data.idb && !data.project) return null;
    if (!data.project) return null;
    return { savedAt: data.savedAt, project: data.project };
  } catch {
    return null;
  }
}

/** Full autosave load including IndexedDB (survives large base64 assets). */
export async function loadAutosaveAsync(): Promise<AutosavePayload | null> {
  try {
    const fromIdb = await idbGet<AutosavePayload>(IDB_AUTOSAVE_KEY);
    if (fromIdb?.project && fromIdb.savedAt) return fromIdb;
  } catch {
    /* fall through */
  }
  return loadAutosave();
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
  void idbDel(IDB_AUTOSAVE_KEY);
}

/**
 * Write autosave draft with FULL asset payloads.
 * IndexedDB is primary (large quota). localStorage keeps a copy only when it fits —
 * we never strip data: URLs to empty strings (that caused post-restart image loss).
 */
export function writeAutosave(project: Project): boolean {
  if (!getPersistencePrefs().autosaveEnabled) return false;
  const payload: AutosavePayload = {
    savedAt: new Date().toISOString(),
    project,
  };

  // Primary: IndexedDB (async, fire-and-forget but errors logged)
  void idbSet(IDB_AUTOSAVE_KEY, payload).catch((err) => {
    console.warn("[autosave] IndexedDB write failed:", err);
  });

  // Secondary: localStorage only when the full payload fits — never slim away src
  try {
    const json = JSON.stringify(payload);
    if (byteLength(json) <= MAX_JSON_BYTES) {
      localStorage.setItem(AUTOSAVE_KEY, json);
    } else {
      // Marker so UI can show "draft exists"; restore must use loadAutosaveAsync
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({ savedAt: payload.savedAt, idb: true }),
      );
    }
    return true;
  } catch (err) {
    console.warn("[autosave] localStorage write failed:", err);
    // IDB may still succeed
    return true;
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
  // Sync path: localStorage only (may be empty for large projects).
  const store = readRecentStore();
  return store.snapshots[id] ?? null;
}

/** Prefer IndexedDB snapshot, then localStorage. */
export async function loadRecentSnapshotAsync(
  id: string,
): Promise<Project | null> {
  try {
    const fromIdb = await idbGet<Project>(`recent:${id}`);
    if (fromIdb) return fromIdb;
  } catch {
    /* fall through */
  }
  return loadRecentSnapshot(id);
}

/**
 * Push or update a recent project entry after open / manual save.
 * Full project snapshots go to IndexedDB so image-heavy projects stay openable.
 * localStorage keeps the entry list (+ small snapshots when they fit).
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
  const snapshots = { ...store.snapshots };

  // Always try IndexedDB for the full snapshot (async)
  void idbSet(`recent:${id}`, project).catch((err) => {
    console.warn("[recent] IndexedDB snapshot failed:", err);
  });

  let hasSnapshot = true; // IDB write assumed; open path falls back to LS
  try {
    const json = JSON.stringify(project);
    if (byteLength(json) <= MAX_JSON_BYTES) {
      snapshots[id] = project;
      hasSnapshot = true;
    } else {
      // Too large for localStorage — keep entry enabled via IDB
      delete snapshots[id];
      hasSnapshot = true;
    }
  } catch {
    delete snapshots[id];
    hasSnapshot = true; // still try IDB on open
  }

  entries.unshift({
    id,
    name,
    modifiedAt: project.meta.modifiedAt || new Date().toISOString(),
    hasSnapshot,
  });

  const capped = entries.slice(0, RECENT_LIMIT);
  const keep = new Set(capped.map((e) => e.id));
  for (const key of Object.keys(snapshots)) {
    if (!keep.has(key)) delete snapshots[key];
  }
  // Best-effort prune IDB orphans is skipped (keys unknown without list)

  writeRecentStore({ entries: capped, snapshots });
}

export function removeRecentProject(id: string): void {
  const store = readRecentStore();
  delete store.snapshots[id];
  writeRecentStore({
    entries: store.entries.filter((e) => e.id !== id),
    snapshots: store.snapshots,
  });
  void idbDel(`recent:${id}`);
}

export function clearRecentProjects(): void {
  try {
    const store = readRecentStore();
    for (const e of store.entries) {
      void idbDel(`recent:${e.id}`);
    }
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
