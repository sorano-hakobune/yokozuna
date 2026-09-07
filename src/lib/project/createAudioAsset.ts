import type { Asset } from "@/types/project";
import { readFileAsDataURL, getExtension } from "@/lib/file-utils";

export type NewAudioAsset = Omit<Asset, "id">;

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "webm",
  "flac",
]);

export function getAudioMimeType(fileName: string): string {
  const ext = getExtension(fileName) || "mp3";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  if (ext === "flac") return "audio/flac";
  if (ext === "webm") return "audio/webm";
  return `audio/${ext}`;
}

export function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.has(getExtension(file.name));
}

/** Probe duration (seconds) via HTMLAudioElement metadata. */
function readAudioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      resolve(sec > 0 && Number.isFinite(sec) ? sec : 0);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    // Safety timeout
    const timer = window.setTimeout(() => finish(audio.duration || 0), 8000);
    audio.src = src;
  });
}

/**
 * Create a library audio asset from a File (data URL + duration in seconds).
 */
export async function createAudioAssetFromFile(
  file: File,
): Promise<NewAudioAsset> {
  if (!isSupportedAudioFile(file)) {
    throw new Error(`未対応の音声形式です: ${file.name}`);
  }
  const src = await readFileAsDataURL(file);
  const duration = await readAudioDuration(src);
  return {
    type: "audio",
    name: file.name,
    src,
    duration,
    mimeType: file.type || getAudioMimeType(file.name),
  };
}

/** Convert asset duration (seconds) to frames at given fps. */
export function audioDurationToFrames(
  durationSec: number | undefined,
  fps: number,
): number {
  const f = Math.max(1, fps || 24);
  const sec = Math.max(0, durationSec ?? 0);
  if (sec <= 0) return Math.round(f); // 1 second fallback
  return Math.max(1, Math.round(sec * f));
}
