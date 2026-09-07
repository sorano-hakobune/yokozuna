import type { StateCreator } from "zustand";
import type { ProjectState, KeyframeSlice } from "./types";
import type {
  Element,
  FrameLabel,
  Keyframe,
  Layer,
} from "@/types/project";
import {
  cloneElements,
  getPreviousKeyframeElements,
  getTimelineTarget,
  normalizeFrame,
  prepareHistoryPatch,
  projectWithCompositionLabels,
  projectWithLayers,
  shiftFrameLabels,
  shiftLayerFrames,
} from "./shared";
import { generateId } from "@/lib/project";

export const createKeyframeSlice: StateCreator<
  ProjectState,
  [],
  [],
  KeyframeSlice
> = (set, get) => ({
    addKeyframe: (layerId, frame, elements) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };
        frame = normalizeFrame(frame, comp.duration);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.keyframes.some((kf) => kf.frame === frame)) {
                    return layer;
                  }
                  // Flash-style: blank insert copies previous keyframe content
                  // so the same element ids can be tweened across the span.
                  const resolvedElements =
                    elements !== undefined
                      ? cloneElements(elements)
                      : getPreviousKeyframeElements(layer.keyframes, frame);
                  const newKeyframe: Keyframe = {
                    frame,
                    tween: "none",
                    elements: resolvedElements,
                  };
                  return {
                    ...layer,
                    keyframes: [...layer.keyframes, newKeyframe].sort(
                      (a, b) => a.frame - b.frame,
                    ),
                  };
                }),
          ),
        };
      });
    },

    updateKeyframe: (layerId, frame, partial) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.map((kf) =>
                      kf.frame === frame ? { ...kf, ...partial } : kf,
                    ),
                  };
                }),
          ),
        };
      });
    },

    setKeyframeTween: (layerId, frame, tween, easing) => {
      const partial: Partial<Omit<Keyframe, "frame">> = { tween };
      if (easing !== undefined) {
        partial.easing = easing;
      } else if (tween === "none") {
        partial.easing = undefined;
      } else {
        partial.easing = "linear";
      }
      if (tween === "none") {
        partial.easingBezier = undefined;
      } else if (easing === "custom") {
        const existing = get()
          .project.compositions[
            get().project.activeCompositionId
          ]?.layers?.find((l) => l.id === layerId)
          ?.keyframes.find((k) => k.frame === frame);
        // also check symbol timeline
        const state = get();
        let kf = existing;
        if (state.editingSymbolId) {
          kf = state.project.symbols[state.editingSymbolId]?.layers
            .find((l) => l.id === layerId)
            ?.keyframes.find((k) => k.frame === frame);
        }
        if (!kf?.easingBezier) {
          partial.easingBezier = [0.42, 0, 0.58, 1];
        }
      } else if (easing !== undefined) {
        // keep bezier data around in case user switches back 窶・no clear
      }
      if (tween !== "motion") {
        partial.motionPath = undefined;
      }
      get().updateKeyframe(layerId, frame, partial);
    },

    setKeyframeMotionPath: (layerId, frame, motionPath) => {
      get().updateKeyframe(layerId, frame, {
        motionPath,
        // ensure motion tween when assigning a path
        ...(motionPath ? { tween: "motion" as const } : {}),
      });
    },

    removeKeyframe: (layerId, frame) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.keyframes.length <= 1) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.filter(
                      (kf) => kf.frame !== frame,
                    ),
                  };
                }),
          ),
        };
      });
    },

    moveKeyframe: (layerId, fromFrame, toFrame) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };
        fromFrame = normalizeFrame(fromFrame, comp.duration);
        toFrame = normalizeFrame(toFrame, comp.duration);
        if (fromFrame === toFrame) return state;

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.locked) return layer;
                  if (layer.keyframes.some((kf) => kf.frame === toFrame)) {
                    return layer;
                  }
                  if (!layer.keyframes.some((kf) => kf.frame === fromFrame)) {
                    return layer;
                  }
                  return {
                    ...layer,
                    keyframes: layer.keyframes
                      .map((kf) =>
                        kf.frame === fromFrame ? { ...kf, frame: toFrame } : kf,
                      )
                      .sort((a, b) => a.frame - b.frame),
                  };
                }),
          ),
        };
      });
    },

    captureKeyframeClipboard: (layerId, frame) => {
      const state = get();
      const target = getTimelineTarget(state);
      if (!target) return;
      const layer = target.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const kf = layer.keyframes.find((k) => k.frame === frame);
      if (!kf) return;
      set({
        keyframeClipboard: {
          elements: cloneElements(kf.elements),
          tween: kf.tween,
          ...(kf.easing ? { easing: kf.easing } : {}),
        },
      });
    },

    pasteKeyframeClipboard: (layerId, frame) => {
      set((state) => {
        const clip = state.keyframeClipboard;
        if (!clip) return state;
        const target = getTimelineTarget(state);
        if (!target) return state;
        frame = normalizeFrame(frame, target.duration);
        const layer = target.layers.find((l) => l.id === layerId);
        if (!layer || layer.locked) return state;

        const elements = clip.elements.map((el) => ({
          ...JSON.parse(JSON.stringify(el)),
          id: generateId(el.type === "shape" ? "shape" : el.type),
        })) as Element[];

        const existing = layer.keyframes.find((k) => k.frame === frame);
        const keyframe: Keyframe = {
          frame,
          tween: clip.tween,
          ...(clip.easing ? { easing: clip.easing } : {}),
          elements,
        };
        const keyframes = existing
          ? layer.keyframes.map((k) => (k.frame === frame ? keyframe : k))
          : [...layer.keyframes, keyframe].sort((a, b) => a.frame - b.frame);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            target.layers.map((l) =>
              l.id === layerId ? { ...l, keyframes } : l,
            ),
          ),
        };
      });
    },

    copyKeyframe: (layerId, fromFrame, toFrame) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };
        fromFrame = normalizeFrame(fromFrame, comp.duration);
        toFrame = normalizeFrame(toFrame, comp.duration);
        if (fromFrame === toFrame) return state;

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.locked) return layer;
                  if (layer.keyframes.some((kf) => kf.frame === toFrame)) {
                    return layer;
                  }
                  const source = layer.keyframes.find(
                    (kf) => kf.frame === fromFrame,
                  );
                  if (!source) return layer;
                  const cloned: Keyframe = {
                    frame: toFrame,
                    tween: source.tween,
                    ...(source.easing ? { easing: source.easing } : {}),
                    elements: cloneElements(source.elements),
                  };
                  return {
                    ...layer,
                    keyframes: [...layer.keyframes, cloned].sort(
                      (a, b) => a.frame - b.frame,
                    ),
                  };
                }),
          ),
        };
      });
    },



    addFrameLabel: (frame, name, color) => {
      let id: string | undefined;
      set((state) => {
        if (state.editingSymbolId) return state;
        const compId = state.project.activeCompositionId;
        const comp = state.project.compositions[compId];
        if (!comp) return state;
        const f = Math.max(0, Math.min(comp.duration - 1, Math.round(frame)));
        const trimmed = (name || "").trim() || `繝ｩ繝吶Ν ${f}`;
        const rest = (comp.labels ?? []).filter((l) => l.frame !== f);
        id = generateId("label");
        const lab: FrameLabel = {
          id,
          frame: f,
          name: trimmed,
          ...(color ? { color } : {}),
        };
        return {
          ...prepareHistoryPatch(state),
          project: projectWithCompositionLabels(state.project, compId, [
            ...rest,
            lab,
          ].sort((a, b) => a.frame - b.frame)),
        };
      });
      return id;
    },

    updateFrameLabel: (id, partial) => {
      set((state) => {
        const compId = state.project.activeCompositionId;
        const comp = state.project.compositions[compId];
        if (!comp?.labels) return state;
        const labels = comp.labels.map((l) => {
          if (l.id !== id) return l;
          const next = { ...l, ...partial };
          if (partial.frame != null) {
            next.frame = Math.max(
              0,
              Math.min(comp.duration - 1, Math.round(partial.frame)),
            );
          }
          if (partial.name != null) {
            next.name = String(partial.name).trim() || l.name;
          }
          return next;
        });
        return {
          ...prepareHistoryPatch(state),
          project: projectWithCompositionLabels(state.project, compId, labels),
        };
      });
    },

    removeFrameLabel: (id) => {
      set((state) => {
        const compId = state.project.activeCompositionId;
        const comp = state.project.compositions[compId];
        if (!comp?.labels) return state;
        return {
          ...prepareHistoryPatch(state),
          project: projectWithCompositionLabels(
            state.project,
            compId,
            comp.labels.filter((l) => l.id !== id),
          ),
        };
      });
    },

    insertFrames: (atFrame, count = 1, scope = "all", layerId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const n = Math.max(1, Math.round(count));
        atFrame = Math.max(0, Math.round(atFrame));
        // Allow inserting at duration (append)
        if (atFrame > target.duration) atFrame = target.duration;

        const apply = (layer: Layer) =>
          shiftLayerFrames(layer, atFrame, n, 0);

        let newLayers: Layer[];
        if (scope === "layer") {
          const id = layerId ?? state.selectedLayerId;
          if (!id) return state;
          newLayers = target.layers.map((l) =>
            l.id === id && !l.locked ? apply(l) : l,
          );
        } else {
          // All layers must stay in sync with duration
          newLayers = target.layers.map((l) => apply(l));
        }

        let project = projectWithLayers(
          state.project,
          target,
          newLayers,
          target.duration + n,
        );
        if (target.kind === "composition" && scope === "all") {
          const comp = project.compositions[target.id];
          if (comp) {
            project = projectWithCompositionLabels(
              project,
              target.id,
              shiftFrameLabels(comp.labels, atFrame, n, 0),
            );
          }
        }
        return {
          ...prepareHistoryPatch(state),
          project,
        };
      });
    },

    removeFrames: (atFrame, count = 1, scope = "all", layerId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const n = Math.max(1, Math.round(count));
        atFrame = Math.max(0, Math.round(atFrame));
        if (atFrame >= target.duration) return state;
        const removeCount = Math.min(n, target.duration - atFrame);
        if (removeCount <= 0) return state;
        // Never allow duration below 1
        const newDuration = Math.max(1, target.duration - removeCount);
        // If removing would leave no frames, keep frame 0
        const delta = -removeCount;

        const apply = (layer: Layer) =>
          shiftLayerFrames(layer, atFrame, delta, removeCount);

        let newLayers: Layer[];
        if (scope === "layer") {
          const id = layerId ?? state.selectedLayerId;
          if (!id) return state;
          newLayers = target.layers.map((l) =>
            l.id === id && !l.locked ? apply(l) : l,
          );
        } else {
          newLayers = target.layers.map((l) => apply(l));
        }

        const nextFrame = Math.min(
          state.currentFrame,
          Math.max(0, newDuration - 1),
        );

        let project = projectWithLayers(
          state.project,
          target,
          newLayers,
          newDuration,
        );
        if (target.kind === "composition" && scope === "all") {
          const comp = project.compositions[target.id];
          if (comp) {
            project = projectWithCompositionLabels(
              project,
              target.id,
              shiftFrameLabels(comp.labels, atFrame, delta, removeCount),
            );
          }
        }
        return {
          ...prepareHistoryPatch(state),
          project,
          currentFrame: nextFrame,
        };
      });
    },
});
