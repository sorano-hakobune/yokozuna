/**
 * Onion-skin (ghost frame) helpers — Flash / Animate style.
 *
 * Past frames fade behind the playhead; future frames fade ahead.
 * Opacity falls off with distance from the current frame.
 */

export type OnionSkinSide = "past" | "future";

export interface OnionSkinFrame {
  frame: number;
  side: OnionSkinSide;
  /** 0–1 group opacity for the ghost content */
  opacity: number;
  /** Distance in frames from the playhead (1 = nearest) */
  distance: number;
}

export interface OnionSkinSettings {
  enabled: boolean;
  /** How many frames before the playhead (0–10) */
  before: number;
  /** How many frames after the playhead (0–10) */
  after: number;
}

export const DEFAULT_ONION_SKIN: OnionSkinSettings = {
  enabled: false,
  before: 2,
  after: 2,
};

const clampCount = (n: number) =>
  Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : 0)));

/** Opacity for a ghost at the given distance (1 = nearest). */
export function onionOpacity(distance: number, side: OnionSkinSide): number {
  const d = Math.max(1, distance);
  // Past slightly stronger so pose comparison is easier
  const base = side === "past" ? 0.38 : 0.32;
  return Math.max(0.08, base * Math.pow(0.55, d - 1));
}

/**
 * Build the list of ghost frames around `currentFrame`.
 * Past frames are ordered farthest → nearest; future nearest → farthest
 * so paint order draws distant ghosts first.
 */
export function buildOnionSkinFrames(
  currentFrame: number,
  duration: number,
  before: number,
  after: number,
): OnionSkinFrame[] {
  const maxFrame = Math.max(0, duration - 1);
  const pastCount = clampCount(before);
  const futureCount = clampCount(after);
  const frames: OnionSkinFrame[] = [];

  // Farthest past first (drawn underneath nearer ghosts)
  for (let d = pastCount; d >= 1; d -= 1) {
    const frame = currentFrame - d;
    if (frame < 0 || frame > maxFrame) continue;
    frames.push({
      frame,
      side: "past",
      distance: d,
      opacity: onionOpacity(d, "past"),
    });
  }

  // Nearest future first among futures… actually farthest future first for paint
  for (let d = futureCount; d >= 1; d -= 1) {
    const frame = currentFrame + d;
    if (frame < 0 || frame > maxFrame) continue;
    frames.push({
      frame,
      side: "future",
      distance: d,
      opacity: onionOpacity(d, "future"),
    });
  }

  return frames;
}
