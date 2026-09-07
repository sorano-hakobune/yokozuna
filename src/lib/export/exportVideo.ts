import type { Project } from "@/types/project";
import { downloadBlob, sanitizeFileName, sleep } from "@/lib/file-utils";
import {
  preloadProjectImages,
  renderCompositionFrame,
} from "./renderFrameCanvas";

export type ExportVideoOptions = {
  project: Project;
  compositionId?: string;
  startFrame?: number;
  endFrame?: number;
  /** Pixel scale (default 1) */
  scale?: number;
  /**
   * Override fps (default: project.settings.fps).
   * Used both for frame timing and captureStream hint.
   */
  fps?: number;
  /** Solid background only — WebM alpha is unreliable across browsers */
  backgroundColor?: string;
  filePrefix?: string;
  /**
   * Video bitrate in bits/sec (default scales with resolution).
   */
  videoBitsPerSecond?: number;
  onProgress?: (current: number, total: number) => void;
  shouldContinue?: () => boolean;
};

/** Prefer VP9+Opus, then VP8+Opus, then video-only fallbacks. */
export function pickWebmMimeType(withAudio = false): string {
  const candidates = withAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ]
    : [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  throw new Error(
    "このブラウザは WebM 動画の録画（MediaRecorder）に対応していません。",
  );
}

async function decodeAudioAsset(
  ctx: AudioContext,
  src: string,
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    return await ctx.decodeAudioData(buf.slice(0));
  } catch {
    return null;
  }
}

/**
 * Export composition frames as a WebM video via MediaRecorder + canvas stream.
 */
export async function exportWebmVideo(
  options: ExportVideoOptions,
): Promise<{ exported: number; cancelled: boolean; fileName: string }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder が利用できません。");
  }

  const { project } = options;
  const compositionId = options.compositionId ?? project.activeCompositionId;
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
  const fps = Math.max(1, Math.min(60, options.fps ?? project.settings.fps ?? 24));
  const scale = options.scale ?? 1;
  const frameMs = 1000 / fps;
  const prefix = sanitizeFileName(
    options.filePrefix ?? project.meta.name ?? composition.name ?? "export",
  );
  const fileName = `${prefix}.webm`;
  const bg =
    options.backgroundColor ?? project.settings.backgroundColor ?? "#ffffff";

  const sounds = (composition.sounds ?? []).filter(
    (s) => !s.muted && s.volume > 0 && project.assets[s.assetId]?.type === "audio",
  );
  const wantAudio = sounds.length > 0;
  const mimeType = pickWebmMimeType(wantAudio);

  const cache = await preloadProjectImages(project);

  // Create off-screen canvas attached to DOM to ensure Compositor and captureStream delivery
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(project.settings.width * scale));
  canvas.height = Math.max(1, Math.round(project.settings.height * scale));
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  canvas.style.top = "-99999px";
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "-1000";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    canvas.remove();
    throw new Error("Canvas 2D context が取得できませんでした。");
  }

  const w = canvas.width;
  const h = canvas.height;
  const bitrate =
    options.videoBitsPerSecond ??
    Math.min(12_000_000, Math.max(1_000_000, Math.round(w * h * fps * 0.12)));

  type CanvasWithCapture = HTMLCanvasElement & {
    captureStream?: (frameRate?: number) => MediaStream;
  };
  const c = canvas as CanvasWithCapture;
  if (typeof c.captureStream !== "function") {
    canvas.remove();
    throw new Error("canvas.captureStream が利用できません。");
  }

  const videoStream: MediaStream = c.captureStream(fps);
  const track = videoStream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;

  const drawFrame = (frame: number) => {
    const frameCanvas = renderCompositionFrame(
      project,
      composition.layers,
      frame,
      cache,
      {
        width: project.settings.width,
        height: project.settings.height,
        backgroundColor: bg,
        transparent: false,
        scale,
      },
    );
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frameCanvas, 0, 0);
    if (track?.requestFrame) {
      try {
        track.requestFrame();
      } catch {
        /* ignore */
      }
    }
  };

  // Optional audio mix via Web Audio → MediaStreamDestination
  let audioCtx: AudioContext | null = null;
  let recordStream: MediaStream = videoStream;
  const scheduled: AudioBufferSourceNode[] = [];

  if (wantAudio && typeof AudioContext !== "undefined") {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      for (const sound of sounds) {
        const asset = project.assets[sound.assetId];
        if (!asset?.src) continue;
        const buffer = await decodeAudioAsset(audioCtx, asset.src);
        if (!buffer) continue;
        // Relative to export start frame
        const startSec = (sound.startFrame - start) / fps;
        const endSec = (sound.startFrame + sound.durationFrames - start) / fps;
        if (endSec <= 0) continue;
        const offsetInClip = Math.max(0, -startSec);
        const when = audioCtx.currentTime + Math.max(0, startSec);
        const playDur = Math.max(0, endSec - Math.max(0, startSec));
        if (playDur <= 0) continue;

        const srcNode = audioCtx.createBufferSource();
        srcNode.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, sound.volume));
        srcNode.connect(gain);
        gain.connect(dest);
        try {
          srcNode.start(when, offsetInClip, playDur);
          scheduled.push(srcNode);
        } catch {
          /* ignore schedule errors */
        }
      }
      recordStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch (err) {
      console.warn("音声ミックスに失敗、映像のみで書き出します:", err);
      recordStream = videoStream;
      if (audioCtx) {
        try {
          await audioCtx.close();
        } catch {
          /* ignore */
        }
        audioCtx = null;
      }
    }
  }

  const chunks: Blob[] = [];
  let cancelled = false;

  const recorder = new MediaRecorder(recordStream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () =>
      reject(new Error("MediaRecorder でエラーが発生しました"));
  });

  let exported = 0;

  try {
    // Draw initial frame and let browser compositor commit it
    drawFrame(start);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    recorder.start(100); // gather data every 100ms
    // Wait for encoder pipeline to initialize
    await sleep(Math.max(50, Math.round(frameMs)));

    for (let frame = start; frame <= end; frame++) {
      if (options.shouldContinue && !options.shouldContinue()) {
        cancelled = true;
        break;
      }

      const frameStart = performance.now();
      drawFrame(frame);

      // Synchronize with browser animation/rendering cycle
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      exported += 1;
      options.onProgress?.(exported, total);

      const elapsed = performance.now() - frameStart;
      const wait = Math.max(5, frameMs - elapsed);
      await sleep(wait);
    }

    // Let the last frame sit briefly so the encoder captures it
    await sleep(Math.max(frameMs * 2, 100));

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    await stopped;
  } finally {
    canvas.remove();
    for (const src of scheduled) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
    recordStream.getTracks().forEach((t) => t.stop());
    videoStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch {
        /* ignore */
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error("動画データが生成されませんでした");
  }

  const blob = new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" });
  downloadBlob(blob, fileName);

  return { exported, cancelled, fileName };
}
