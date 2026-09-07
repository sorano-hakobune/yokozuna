import { pushRecentProject } from "./persistence";
import type { Project } from "@/types/project";
import {
  saveBlobAs,
  sanitizeFileName,
  pathFileName,
  stripExtension,
} from "@/lib/file-utils";
import type { SaveBlobResult } from "@/lib/file-utils";
import { migrateProjectData, projectSchema } from "./projectSchema";

export { migrateProjectData, projectSchema } from "./projectSchema";

/** Official YOKOZUNA project file extension (v0.1: JSON payload inside). */
export const PROJECT_FILE_EXT = ".yoko";

/**
 * File picker accept list: official .yoko first, legacy .json for import.
 * MIME is advisory; browsers mainly use the extension list.
 */
export const PROJECT_FILE_ACCEPT =
  ".yoko,application/x-yokozuna-project+json,application/json,.json";

const PROJECT_FILE_EXT_RE = /\.(yoko|json)$/i;

/** Strip known project extensions from a file name for display / recent list. */
export function projectBaseName(fileName: string): string {
  return fileName.replace(PROJECT_FILE_EXT_RE, "");
}

/**
 * Save the current project as a .yoko file.
 * v0.1 payload is the same JSON as before (full Project object).
 * Kept export name `downloadProjectJson` for call-site compatibility.
 */
/**
 * Save the current project as a .yoko file (location picker when available).
 * Returns save result so callers can skip mark-saved on cancel.
 */
export async function downloadProjectJson(
  project: Project,
): Promise<SaveBlobResult> {
  const base = sanitizeFileName(project.meta.name || "project");
  const fileName = `${base}${PROJECT_FILE_EXT}`;
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/x-yokozuna-project+json",
  });
  const result = await saveBlobAs(blob, {
    fileName,
    extensions: ["yoko"],
    description: "YOKOZUNA Project",
    mimeTypes: ["application/x-yokozuna-project+json", "application/json"],
  });
  if (result.status !== "cancelled") {
    try {
      // Prefer the name the user actually chose in the dialog
      const chosen = stripExtension(pathFileName(result.fileName || fileName));
      pushRecentProject(project, chosen || project.meta.name || base);
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Alias — preferred name going forward. */
export const downloadProject = downloadProjectJson;

export function pickFiles(options: {
  accept: string;
  multiple?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    input.multiple = Boolean(options.multiple);
    input.style.display = "none";
    const cleanup = () => {
      input.remove();
    };
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      resolve(files);
      cleanup();
    };
    input.addEventListener("change", () => {
      done(Array.from(input.files ?? []));
    });
    // `cancel` is Chromium-only; also settle on focus return for other browsers.
    input.addEventListener("cancel", () => done([]));
    window.setTimeout(() => {
      document.body.appendChild(input);
      input.click();
    }, 0);
  });
}

export async function parseProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `無効なプロジェクトファイルです: ${file.name} (解析失敗)`,
    );
  }
  const result = projectSchema.safeParse(migrateProjectData(json));
  if (!result.success) {
    throw new Error(
      `無効なプロジェクトファイルです: ${file.name} (${result.error.issues.length}件の検証エラー)`,
    );
  }
  return result.data as Project;
}

export async function openProjectFile(
  file: File,
  onProjectLoaded: (project: Project) => void,
): Promise<void> {
  const project = await parseProjectFile(file);
  onProjectLoaded(project);
  try {
    const base = projectBaseName(file.name);
    pushRecentProject(project, project.meta.name || base);
  } catch {
    /* ignore */
  }
}
