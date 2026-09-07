import type { Project } from "@/types/project";
import {
  saveBlobAs,
  saveBlobsToDirectory,
  sanitizeFileName,
} from "@/lib/file-utils";
import {
  canvasToPngBlob,
  preloadProjectImages,
  renderCompositionFrame,
} from "./renderFrameCanvas";
import { blobToUint8Array, buildZipBlob } from "./zipStore";

export type ExportPngSequenceOptions = {
  project: Project;
  /** Defaults to active composition */
  compositionId?: string;
  /** Inclusive start frame (default 0) */
  startFrame?: number;
  /** Inclusive end frame (default duration-1) */
  endFrame?: number;
  /** Pixel scale (default 1) */
  scale?: number;
  /** Filename prefix without extension (default project name) */
  filePrefix?: string;
  /** Transparent background (default false — uses document bg color) */
  transparent?: boolean;
  /**
   * Package all frames into a single .zip download (default true when >1 frame).
   * When false, triggers sequential per-file downloads.
   */
  asZip?: boolean;
  /** Delay between per-file downloads (ms); ignored for zip */
  downloadDelayMs?: number;
  onProgress?: (current: number, total: number, fileName: string) => void;
  /** Return false to cancel */
  shouldContinue?: () => boolean;
};

/**
 * Render each frame of a composition to PNG.
 * Guide layers are omitted; mask layers are applied.
 * Default packages multi-frame exports into one ZIP.
 */
export async function exportPngSequence(
  options: ExportPngSequenceOptions,
): Promise<{ exported: number; cancelled: boolean; mode: "zip" | "files" }> {
  const { project } = options;
  const compositionId =
    options.compositionId ?? project.activeCompositionId;
  const composition = project.compositions[compositionId];
  if (!composition) {
    throw new Error("書き出し対象のコンポジションが見つかりません");
  }

  const duration = Math.max(1, composition.duration);
  const start = Math.max(0, Math.min(duration - 1, options.startFrame ?? 0));
  const end = Math.max(
    start,
    Math.min(duration - 1, options.endFrame ?? duration - 1),
  );
  const total = end - start + 1;
  const digits = Math.max(3, String(end).length);
  const prefix = sanitizeFileName(
    options.filePrefix ?? project.meta.name ?? composition.name ?? "frame",
  );
  const scale = options.scale ?? 1;
  const transparent = options.transparent === true;
  const asZip = options.asZip ?? total > 1;

  const cache = await preloadProjectImages(project);
  let exported = 0;
  const zipFiles: { name: string; data: Uint8Array }[] = [];

  for (let frame = start; frame <= end; frame++) {
    if (options.shouldContinue && !options.shouldContinue()) {
      return { exported, cancelled: true, mode: asZip ? "zip" : "files" };
    }

    const canvas = renderCompositionFrame(
      project,
      composition.layers,
      frame,
      cache,
      {
        width: project.settings.width,
        height: project.settings.height,
        backgroundColor: transparent
          ? "transparent"
          : project.settings.backgroundColor,
        transparent,
        scale,
      },
    );
    const blob = await canvasToPngBlob(canvas);
    const fileName = `${prefix}_${String(frame).padStart(digits, "0")}.png`;

    if (asZip) {
      zipFiles.push({ name: fileName, data: await blobToUint8Array(blob) });
    } else {
      // Collect for a single directory save after the loop
      zipFiles.push({ name: fileName, data: await blobToUint8Array(blob) });
    }

    exported += 1;
    options.onProgress?.(exported, total, fileName);
  }

  if (asZip && zipFiles.length > 0) {
    const zipBlob = buildZipBlob(zipFiles);
    const zipName = `${prefix}_png_sequence.zip`;
    const saveResult = await saveBlobAs(zipBlob, {
      fileName: zipName,
      extensions: ["zip"],
      description: "PNG Sequence ZIP",
      mimeTypes: ["application/zip"],
    });
    if (saveResult.status === "cancelled") {
      return { exported: 0, cancelled: true, mode: "zip" };
    }
    options.onProgress?.(exported, total, zipName);
  } else if (!asZip && zipFiles.length === 1) {
    const only = zipFiles[0]!;
    const blob = new Blob([only.data], { type: "image/png" });
    const saveResult = await saveBlobAs(blob, {
      fileName: only.name,
      extensions: ["png"],
      description: "PNG Image",
      mimeTypes: ["image/png"],
    });
    if (saveResult.status === "cancelled") {
      return { exported: 0, cancelled: true, mode: "files" };
    }
  } else if (!asZip && zipFiles.length > 1) {
    const files = zipFiles.map((f) => ({
      name: f.name,
      blob: new Blob([f.data], { type: "image/png" }),
    }));
    const dirResult = await saveBlobsToDirectory(files, {
      directoryTitle: "PNG連番の保存先フォルダ",
    });
    if (dirResult.status === "cancelled") {
      return { exported: 0, cancelled: true, mode: "files" };
    }
    exported = dirResult.written;
  }

  return { exported, cancelled: false, mode: asZip ? "zip" : "files" };
}
