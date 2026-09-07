import type { StateCreator } from "zustand";
import type { ProjectState, SoundSlice } from "./types";
import type { SoundInstance } from "@/types/project";
import { prepareHistoryPatch, touchMeta } from "./shared";
import { generateId } from "@/lib/project";

export const createSoundSlice: StateCreator<ProjectState, [], [], SoundSlice> = (
  set,
  get,
) => ({
    selectedSoundId: undefined as string | undefined,
    setSelectedSoundId: (id) => set({ selectedSoundId: id }),
    addSound: (assetId, startFrame, durationFrames) => {
      const state = get();
      if (state.editingSymbolId) {
        // Sounds are composition-level only
        return null;
      }
      const asset = state.project.assets[assetId];
      if (!asset || asset.type !== "audio") return null;
      const comp =
        state.project.compositions[state.project.activeCompositionId];
      if (!comp) return null;
      const fps = Math.max(1, state.project.settings.fps || 24);
      const start = Math.max(
        0,
        Math.min(
          Math.max(0, comp.duration - 1),
          startFrame ?? state.currentFrame,
        ),
      );
      const fromAsset = Math.max(
        1,
        Math.round((asset.duration ?? 1) * fps) || fps,
      );
      const dur = Math.max(1, durationFrames ?? fromAsset);
      const id = generateId("snd");
      const sound: SoundInstance = {
        id,
        assetId,
        startFrame: start,
        durationFrames: dur,
        volume: 1,
        muted: false,
        name: asset.name,
      };
      set((s) => {
        const c = s.project.compositions[s.project.activeCompositionId];
        if (!c) return s;
        return {
          ...prepareHistoryPatch(s),
          project: {
            ...s.project,
            compositions: {
              ...s.project.compositions,
              [c.id]: {
                ...c,
                sounds: [...(c.sounds ?? []), sound],
              },
            },
            meta: touchMeta(s.project),
          },
          selectedSoundId: id,
        };
      });
      return id;
    },

    updateSound: (soundId, partial) => {
      set((state) => {
        if (state.editingSymbolId) return state;
        const c =
          state.project.compositions[state.project.activeCompositionId];
        if (!c) return state;
        const sounds = c.sounds ?? [];
        const idx = sounds.findIndex((s) => s.id === soundId);
        if (idx < 0) return state;
        const next = sounds.slice();
        const prev = next[idx]!;
        next[idx] = {
          ...prev,
          ...partial,
          id: prev.id,
          startFrame:
            partial.startFrame !== undefined
              ? Math.max(0, Math.round(partial.startFrame))
              : prev.startFrame,
          durationFrames:
            partial.durationFrames !== undefined
              ? Math.max(1, Math.round(partial.durationFrames))
              : prev.durationFrames,
          volume:
            partial.volume !== undefined
              ? Math.max(0, Math.min(1, partial.volume))
              : prev.volume,
        };
        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [c.id]: { ...c, sounds: next },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    removeSound: (soundId) => {
      set((state) => {
        if (state.editingSymbolId) return state;
        const c =
          state.project.compositions[state.project.activeCompositionId];
        if (!c) return state;
        const sounds = (c.sounds ?? []).filter((s) => s.id !== soundId);
        if (sounds.length === (c.sounds ?? []).length) return state;
        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [c.id]: { ...c, sounds },
            },
            meta: touchMeta(state.project),
          },
          selectedSoundId:
            state.selectedSoundId === soundId
              ? undefined
              : state.selectedSoundId,
        };
      });
    },

    moveSound: (soundId, startFrame) => {
      get().updateSound(soundId, {
        startFrame: Math.max(0, Math.round(startFrame)),
      });
    },
});
