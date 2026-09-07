import { createEmptyProject } from "@/lib/project";
import type {
  Composition,
  EasingType,
  Element,
  FrameLabel,
  Keyframe,
  Layer,
  Project,
  TweenType,
} from "@/types/project";
import type { HistorySnapshot } from "./types";

/** Store-wide initial document (single instance shared by all slices). */
export const initialProject = createEmptyProject();
export const initialLayerId =
  Object.values(initialProject.compositions)[0]?.layers[0]?.id;

export const HISTORY_LIMIT = 50;



export function cloneSnapshot(state: {
  project: Project;
  selectedLayerId: string | undefined;
  selectedElementId: string | undefined;
  selectedElementIds: string[];
  currentFrame: number;
}): HistorySnapshot {
  return {
    project: JSON.parse(JSON.stringify(state.project)) as Project,
    selectedLayerId: state.selectedLayerId,
    selectedElementId: state.selectedElementId,
    selectedElementIds: [...state.selectedElementIds],
    currentFrame: state.currentFrame,
  };
}

/** Prepare past/future patch before a document mutation. No-op during undo/redo or mid-batch. */
export function prepareHistoryPatch(state: {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  _isApplyingHistory: boolean;
  _historyBatchDepth: number;
  _historyBatchPushed: boolean;
  project: Project;
  selectedLayerId: string | undefined;
  selectedElementId: string | undefined;
  selectedElementIds: string[];
  currentFrame: number;
}): Partial<{
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  _historyBatchPushed: boolean;
}> {
  if (state._isApplyingHistory) return {};
  if (state._historyBatchDepth > 0 && state._historyBatchPushed) return {};
  const entry = cloneSnapshot(state);
  return {
    past: [...state.past, entry].slice(-HISTORY_LIMIT),
    future: [],
    ...(state._historyBatchDepth > 0 ? { _historyBatchPushed: true } : {}),
  };
}

export function clearHistoryPatch() {
  return {
    past: [] as HistorySnapshot[],
    future: [] as HistorySnapshot[],
    _historyBatchDepth: 0,
    _historyBatchPushed: false,
  };
}

export function getActiveComp(state: { project: Project }): Composition | null {
  return state.project.compositions[state.project.activeCompositionId] ?? null;
}

export function getTimelineTarget(state: {
  project: Project;
  editingSymbolId?: string;
}): {
  kind: "composition" | "symbol";
  id: string;
  layers: Layer[];
  duration: number;
} | null {
  if (state.editingSymbolId) {
    const symbol = state.project.symbols[state.editingSymbolId];
    if (!symbol) return null;
    return {
      kind: "symbol",
      id: symbol.id,
      layers: symbol.layers,
      duration: Math.max(1, symbol.duration),
    };
  }
  const composition =
    state.project.compositions[state.project.activeCompositionId];
  if (!composition) return null;
  return {
    kind: "composition",
    id: composition.id,
    layers: composition.layers,
    duration: composition.duration,
  };
}

export function projectWithLayers(
  project: Project,
  target: { kind: "composition" | "symbol"; id: string },
  layers: Layer[],
  duration?: number,
): Project {
  if (target.kind === "symbol") {
    const symbol = project.symbols[target.id];
    if (!symbol) return project;
    return {
      ...project,
      symbols: {
        ...project.symbols,
        [target.id]: {
          ...symbol,
          layers,
          ...(duration !== undefined
            ? { duration: Math.max(1, Math.round(duration)) }
            : {}),
        },
      },
      meta: touchMeta(project),
    };
  }
  const composition = project.compositions[target.id];
  if (!composition) return project;
  return {
    ...project,
    compositions: {
      ...project.compositions,
      [target.id]: {
        ...composition,
        layers,
        ...(duration !== undefined
          ? { duration: Math.max(1, Math.round(duration)) }
          : {}),
      },
    },
    meta: touchMeta(project),
  };
}

/** Shift / cull keyframes for insert (delta>0) or remove (delta<0) at `atFrame`. */
export function shiftLayerFrames(
  layer: Layer,
  atFrame: number,
  delta: number,
  removeCount: number,
): Layer {
  if (delta === 0 && removeCount === 0) return layer;
  const next: Keyframe[] = [];
  for (const kf of layer.keyframes) {
    if (removeCount > 0) {
      // Drop keyframes inside [atFrame, atFrame+removeCount)
      if (kf.frame >= atFrame && kf.frame < atFrame + removeCount) {
        continue;
      }
      if (kf.frame >= atFrame + removeCount) {
        next.push({ ...kf, frame: kf.frame + delta });
        continue;
      }
      next.push(kf);
      continue;
    }
    // Insert: shift frames at/after atFrame forward
    if (kf.frame >= atFrame) {
      next.push({ ...kf, frame: kf.frame + delta });
    } else {
      next.push(kf);
    }
  }
  next.sort((a, b) => a.frame - b.frame);
  // If all keyframes were removed, ensure at least one empty keyframe at frame 0
  if (next.length === 0) {
    next.push({
      frame: 0,
      tween: "none",
      elements: [],
    });
  }
  return { ...layer, keyframes: next };
}


export function touchMeta(project: Project): Project["meta"] {
  return {
    ...project.meta,
    modifiedAt: new Date().toISOString(),
  };
}

export function projectContentKey(project: Project): string {
  const { modifiedAt: _modifiedAt, ...stableMeta } = project.meta;
  return JSON.stringify({
    ...project,
    meta: stableMeta,
  });
}

export function normalizeFrame(frame: number, duration: number): number {
  if (!Number.isFinite(frame)) return 0;
  return Math.max(0, Math.min(Math.max(0, duration - 1), Math.round(frame)));
}

export function normalizeDuration(duration: number, fallback: number): number {
  return Number.isFinite(duration)
    ? Math.max(1, Math.round(duration))
    : fallback;
}

export function getProjectSelectionState(project: Project) {
  return {
    project,
    currentFrame: 0,
    selectedLayerId:
      project.compositions[project.activeCompositionId]?.layers[0]?.id,
    selectedElementId: undefined,
    selectedElementIds: [] as string[],
    clipboard: null as Element[] | null,
    keyframeClipboard: null as {
      elements: Element[];
      tween: TweenType;
      easing?: EasingType;
    } | null,
    _clipboardPasteGen: 0,
  };
}

export function replaceLayerKeyframe(
  layer: Layer,
  frame: number,
  elements: Element[],
): Layer {
  const existing = layer.keyframes.find((item) => item.frame === frame);
  // Preserve tween / easing when only elements change (e.g. transform edit).
  // Brand-new keyframes default to tween: "none".
  const keyframe: Keyframe = {
    frame,
    tween: existing?.tween ?? "none",
    ...(existing?.easing ? { easing: existing.easing } : {}),
    elements,
  };

  return {
    ...layer,
    keyframes: existing
      ? layer.keyframes.map((item) => (item.frame === frame ? keyframe : item))
      : [...layer.keyframes, keyframe].sort((a, b) => a.frame - b.frame),
  };
}

/** Deep-clone elements so keyframes share structure but not object references. */
export function cloneElements(elements: Element[]): Element[] {
  return elements.map((el) => JSON.parse(JSON.stringify(el)) as Element);
}

/** Elements from the nearest keyframe at or before `frame` (Flash-style insert). */
export function getPreviousKeyframeElements(
  keyframes: Keyframe[],
  frame: number,
): Element[] {
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  let base: Element[] = [];
  for (const kf of sorted) {
    if (kf.frame <= frame) base = kf.elements;
    else break;
  }
  return cloneElements(base);
}


/** Sync primary id + ids array. Empty list clears both. */
export function selectionState(ids: string[]): {
  selectedElementIds: string[];
  selectedElementId: string | undefined;
} {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return {
    selectedElementIds: unique,
    selectedElementId:
      unique.length > 0 ? unique[unique.length - 1] : undefined,
  };
}


export function shiftFrameLabels(
  labels: FrameLabel[] | undefined,
  atFrame: number,
  delta: number,
  removeCount: number,
): FrameLabel[] | undefined {
  if (!labels?.length) return labels;
  if (delta === 0 && removeCount === 0) return labels;
  const out: FrameLabel[] = [];
  for (const lab of labels) {
    if (removeCount > 0 && lab.frame >= atFrame && lab.frame < atFrame + removeCount) {
      continue; // deleted with frames
    }
    if (lab.frame >= atFrame) {
      out.push({ ...lab, frame: Math.max(0, lab.frame + delta) });
    } else {
      out.push(lab);
    }
  }
  // de-dupe by frame (keep first)
  const seen = new Set<number>();
  const deduped: FrameLabel[] = [];
  for (const lab of out.sort((a, b) => a.frame - b.frame)) {
    if (seen.has(lab.frame)) continue;
    seen.add(lab.frame);
    deduped.push(lab);
  }
  return deduped;
}

export function projectWithCompositionLabels(
  project: Project,
  compositionId: string,
  labels: FrameLabel[] | undefined,
): Project {
  const composition = project.compositions[compositionId];
  if (!composition) return project;
  return {
    ...project,
    compositions: {
      ...project.compositions,
      [compositionId]: {
        ...composition,
        labels,
      },
    },
    meta: touchMeta(project),
  };
}
