/** Shared browser / Tauri file helpers (single implementation). */

export function sanitizeFileName(name: string): string {
  // Only sanitize a bare file name — never a full path
  const base = name.replace(/^.*[/\\]/, "");
  return (base || "export").replace(/[\\/:*?"<>|]+/g, "_").trim() || "export";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function downloadBlob(
  blob: Blob,
  fileName: string,
  revokeAfterMs = 4000,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  // Required for Firefox: element must be in DOM to trigger download.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Basename without directory (works with / and \\). */
export function pathFileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** Basename without extension. */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

// ---------------------------------------------------------------------------
// saveBlobAs — Tauri native dialog first, then File System Access API,
// then legacy <a download> fallback.
// ---------------------------------------------------------------------------

export type SaveBlobStatus = "saved" | "cancelled" | "downloaded";

export type SaveBlobResult = {
  status: SaveBlobStatus;
  /** Full path when Tauri saved successfully */
  path?: string;
  /** Final file name (user may have renamed in the dialog) */
  fileName: string;
};

export type SaveBlobAsOptions = {
  /** Suggested file name including extension (e.g. "MyAnim.yoko") */
  fileName: string;
  /** Dialog filter extensions without dot, e.g. ["yoko"] */
  extensions?: string[];
  /** Human-readable filter description */
  description?: string;
  /** MIME type(s) for File System Access API accept map */
  mimeTypes?: string[];
};

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}

function acceptTypesFromOptions(
  opts: SaveBlobAsOptions,
): { description: string; accept: Record<string, string[]> }[] {
  const ext = getExtension(opts.fileName);
  const extensions = (opts.extensions?.length
    ? opts.extensions
    : ext
      ? [ext]
      : []
  ).map((e) => e.replace(/^\./, ""));
  const mimes =
    opts.mimeTypes?.length
      ? opts.mimeTypes
      : guessMimeTypes(extensions[0] ?? ext);
  const accept: Record<string, string[]> = {};
  for (const mime of mimes) {
    accept[mime] = extensions.map((e) => `.${e}`);
  }
  if (Object.keys(accept).length === 0) {
    accept["application/octet-stream"] = extensions.map((e) => `.${e}`);
  }
  return [
    {
      description: opts.description ?? "File",
      accept,
    },
  ];
}

function guessMimeTypes(ext: string): string[] {
  switch (ext.replace(/^\./, "").toLowerCase()) {
    case "yoko":
      return ["application/x-yokozuna-project+json", "application/json"];
    case "json":
      return ["application/json"];
    case "png":
      return ["image/png"];
    case "zip":
      return ["application/zip"];
    case "webm":
      return ["video/webm"];
    case "svg":
      return ["image/svg+xml"];
    default:
      return ["application/octet-stream"];
  }
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Ensure the chosen path ends with one of the expected extensions.
 * Some OS dialogs strip unknown extensions (e.g. .yoko).
 */
function ensureExtension(path: string, extensions: string[]): string {
  if (!extensions.length) return path;
  const lower = path.toLowerCase();
  if (extensions.some((e) => lower.endsWith(`.${e.toLowerCase()}`))) {
    return path;
  }
  return `${path}.${extensions[0]}`;
}

type TauriSaveAttempt =
  | { kind: "unavailable" }
  | { kind: "cancelled" }
  | { kind: "saved"; path: string }
  | { kind: "error"; error: unknown; path?: string };

/**
 * Try Tauri dialog + writeFile.
 * - unavailable: not in Tauri or plugins missing → caller may fall back
 * - cancelled: user closed dialog → do NOT fall back to download
 * - saved: written to disk
 * - error: dialog OK but write failed → do NOT silently download
 */
async function trySaveBlobTauri(
  blob: Blob,
  opts: SaveBlobAsOptions,
): Promise<TauriSaveAttempt> {
  // Prefer probing the plugin itself over fragile window flags
  let save: (options?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }) => Promise<string | null>;
  let writeFile: (
    path: string,
    data: Uint8Array,
    options?: unknown,
  ) => Promise<void>;

  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    save = dialog.save;
    writeFile = fs.writeFile as typeof writeFile;
  } catch (err) {
    if (isTauriRuntime()) {
      console.error(
        "[saveBlobAs] Tauri runtime detected but dialog/fs plugins failed to load:",
        err,
      );
    }
    return { kind: "unavailable" };
  }

  const ext = getExtension(opts.fileName);
  const extensions = (
    opts.extensions?.length ? opts.extensions : ext ? [ext] : ["bin"]
  ).map((e) => e.replace(/^\./, ""));

  let path: string | null;
  try {
    path = await save({
      defaultPath: opts.fileName,
      title: opts.description ? `${opts.description}を保存` : "保存",
      filters: [
        {
          name: opts.description ?? "File",
          extensions,
        },
      ],
    });
  } catch (err) {
    console.error("[saveBlobAs] Tauri save() dialog failed:", err);
    return { kind: "error", error: err };
  }

  if (path === null || path === undefined || path === "") {
    return { kind: "cancelled" };
  }

  path = ensureExtension(path, extensions);

  try {
    const data = await blobToUint8Array(blob);
    await writeFile(path, data);
    return { kind: "saved", path };
  } catch (err) {
    console.error(
      "[saveBlobAs] Tauri writeFile failed for path:",
      path,
      err,
    );
    return { kind: "error", error: err, path };
  }
}

/**
 * Chromium File System Access API.
 */
async function trySaveBlobFilePicker(
  blob: Blob,
  opts: SaveBlobAsOptions,
): Promise<TauriSaveAttempt> {
  const w = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  };
  if (typeof w.showSaveFilePicker !== "function") {
    return { kind: "unavailable" };
  }

  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: opts.fileName,
      types: acceptTypesFromOptions(opts),
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { kind: "saved", path: handle.name };
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: string }).name)
        : "";
    if (name === "AbortError") return { kind: "cancelled" };
    console.error("[saveBlobAs] showSaveFilePicker failed:", err);
    return { kind: "error", error: err };
  }
}

/**
 * Save a Blob with an explicit user-chosen location when possible.
 *
 * Priority:
 * 1. Tauri dialog.save + fs.writeFile
 * 2. Browser showSaveFilePicker (Chromium)
 * 3. Legacy anchor download (Downloads folder) — only if no dialog was shown
 *
 * Important: if the user picked a path in a dialog and write fails,
 * we surface the error instead of silently downloading under the old name.
 */
export async function saveBlobAs(
  blob: Blob,
  fileNameOrOpts: string | SaveBlobAsOptions,
): Promise<SaveBlobResult> {
  const opts: SaveBlobAsOptions =
    typeof fileNameOrOpts === "string"
      ? { fileName: fileNameOrOpts }
      : fileNameOrOpts;
  const suggestedName = sanitizeFileName(opts.fileName);

  const tauri = await trySaveBlobTauri(blob, {
    ...opts,
    fileName: suggestedName,
  });

  if (tauri.kind === "cancelled") {
    return { status: "cancelled", fileName: suggestedName };
  }
  if (tauri.kind === "saved") {
    return {
      status: "saved",
      path: tauri.path,
      fileName: pathFileName(tauri.path),
    };
  }
  if (tauri.kind === "error") {
    const detail =
      tauri.error instanceof Error
        ? tauri.error.message
        : String(tauri.error ?? "unknown");
    const where = tauri.path ? `\nパス: ${tauri.path}` : "";
    window.alert(
      `ファイルの保存に失敗しました。${where}\n\n${detail}\n\n` +
        `Tauri の fs / dialog 権限（capabilities）を確認してください。\n` +
        `例: fs:allow-write-file とダイアログで選んだパスへの scope`,
    );
    return { status: "cancelled", fileName: suggestedName };
  }

  // Tauri unavailable → try browser picker
  const picker = await trySaveBlobFilePicker(blob, {
    ...opts,
    fileName: suggestedName,
  });
  if (picker.kind === "cancelled") {
    return { status: "cancelled", fileName: suggestedName };
  }
  if (picker.kind === "saved") {
    return {
      status: "saved",
      path: picker.path,
      fileName: pathFileName(picker.path ?? suggestedName),
    };
  }
  if (picker.kind === "error") {
    const detail =
      picker.error instanceof Error
        ? picker.error.message
        : String(picker.error ?? "unknown");
    window.alert(`ファイルの保存に失敗しました。\n\n${detail}`);
    return { status: "cancelled", fileName: suggestedName };
  }

  // Last resort: browser download manager (no real path control)
  downloadBlob(blob, suggestedName);
  return { status: "downloaded", fileName: suggestedName };
}

export type SaveBlobsResult = {
  status: SaveBlobStatus;
  directory?: string;
  written: number;
};

/**
 * Write multiple named blobs into one directory chosen by the user.
 * Used for PNG sequence export when not packing as ZIP.
 */
export async function saveBlobsToDirectory(
  files: { name: string; blob: Blob }[],
  opts?: { directoryTitle?: string },
): Promise<SaveBlobsResult> {
  if (files.length === 0) {
    return { status: "cancelled", written: 0 };
  }

  // --- Tauri directory ---
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const pathApi = await import("@tauri-apps/api/path");

    const selected = await dialog.open({
      directory: true,
      multiple: false,
      title: opts?.directoryTitle ?? "書き出し先フォルダを選択",
    });
    if (selected === null || selected === undefined || selected === "") {
      return { status: "cancelled", written: 0 };
    }
    const dir = Array.isArray(selected) ? selected[0] : selected;
    if (!dir) return { status: "cancelled", written: 0 };

    let written = 0;
    try {
      for (const file of files) {
        const full = await pathApi.join(dir, sanitizeFileName(file.name));
        const data = await blobToUint8Array(file.blob);
        await fs.writeFile(full, data);
        written += 1;
      }
      return { status: "saved", directory: dir, written };
    } catch (err) {
      console.error("[saveBlobsToDirectory] write failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      window.alert(
        `フォルダへの書き込みに失敗しました。\n\n${detail}\n\n` +
          `capabilities の fs scope を確認してください。`,
      );
      return { status: "cancelled", written };
    }
  } catch (err) {
    if (isTauriRuntime()) {
      console.error(
        "[saveBlobsToDirectory] Tauri plugins unavailable:",
        err,
      );
    }
    // fall through to browser
  }

  // --- Browser directory picker ---
  const w = window as Window & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker === "function") {
    try {
      const dirHandle = await w.showDirectoryPicker({ mode: "readwrite" });
      let written = 0;
      for (const file of files) {
        const fh = await dirHandle.getFileHandle(sanitizeFileName(file.name), {
          create: true,
        });
        const writable = await fh.createWritable();
        await writable.write(file.blob);
        await writable.close();
        written += 1;
      }
      return {
        status: "saved",
        directory: dirHandle.name,
        written,
      };
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      if (name === "AbortError") {
        return { status: "cancelled", written: 0 };
      }
      console.error("[saveBlobsToDirectory] showDirectoryPicker failed:", err);
    }
  }

  // --- Legacy sequential downloads ---
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    downloadBlob(file.blob, sanitizeFileName(file.name));
    if (i < files.length - 1) await sleep(120);
  }
  return { status: "downloaded", written: files.length };
}
