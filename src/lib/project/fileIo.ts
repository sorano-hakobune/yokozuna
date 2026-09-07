import { pushRecentProject } from "./persistence";
import type { Project } from "@/types/project";
import { downloadBlob, sanitizeFileName } from "@/lib/file-utils";
import { migrateProjectData, projectSchema } from "./projectSchema";

export { migrateProjectData, projectSchema } from "./projectSchema";

export function downloadProjectJson(project: Project) {
  const base = sanitizeFileName(project.meta.name || "project");
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${base}.json`);
  try {
    pushRecentProject(project, project.meta.name || base);
  } catch {
    /* ignore */
  }
}

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
    throw new Error(`無効なプロジェクトファイルです: ${file.name} (JSON解析失敗)`);
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
    const base = file.name.replace(/\.json$/i, "");
    pushRecentProject(project, project.meta.name || base);
  } catch {
    /* ignore */
  }
}
