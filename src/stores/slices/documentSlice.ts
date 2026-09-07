import type { StateCreator } from "zustand";
import type { ProjectState, DocumentSlice } from "./types";
import type { Composition } from "@/types/project";
import {
  clearHistoryPatch,
  getProjectSelectionState,
  initialProject,
  normalizeDuration,
  prepareHistoryPatch,
  projectContentKey,
  selectionState,
  touchMeta,
} from "./shared";
import { createEmptyProject, generateId } from "@/lib/project";

export const createDocumentSlice: StateCreator<
  ProjectState,
  [],
  [],
  DocumentSlice
> = (set, get) => ({
    project: initialProject,
    savedContentKey: projectContentKey(initialProject),
    isDocumentDirty: () =>
      projectContentKey(get().project) !== get().savedContentKey,
    markProjectSaved: () =>
      set((state) => ({ savedContentKey: projectContentKey(state.project) })),
    createNewProject: (name) => {
      const project = createEmptyProject(name);
      set({
        ...getProjectSelectionState(project),
        ...clearHistoryPatch(),
        editingSymbolId: undefined,
        savedContentKey: projectContentKey(project),
      });
    },

    loadProject: (project) =>
      set({
        ...getProjectSelectionState(project),
        ...clearHistoryPatch(),
        editingSymbolId: undefined,
        savedContentKey: projectContentKey(project),
      }),

    setProject: (project) =>
      set({
        ...getProjectSelectionState(project),
        ...clearHistoryPatch(),
        editingSymbolId: undefined,
        savedContentKey: projectContentKey(project),
      }),

    updateMeta: (partial) => {
      set((state) => ({
        ...prepareHistoryPatch(state),
        project: {
          ...state.project,
          meta: {
            ...state.project.meta,
            ...partial,
            modifiedAt: new Date().toISOString(),
          },
        },
      }));
    },

    updateSettings: (partial) => {
      set((state) => {
        const prev = state.project.settings;
        const nextSettings = {
          ...prev,
          ...partial,
          ...(partial.duration !== undefined
            ? {
                duration: normalizeDuration(
                  partial.duration,
                  prev.duration,
                ),
              }
            : {}),
        };
        // No-op if nothing meaningful changed (prevents update-depth loops)
        const keys = Object.keys(partial) as (keyof typeof partial)[];
        let changed = false;
        for (const k of keys) {
          if (k === "guides") {
            const a = prev.guides ?? [];
            const b = nextSettings.guides ?? [];
            if (a.length !== b.length) {
              changed = true;
              break;
            }
            for (let i = 0; i < a.length; i++) {
              if (
                a[i]!.id !== b[i]!.id ||
                a[i]!.position !== b[i]!.position ||
                a[i]!.orientation !== b[i]!.orientation
              ) {
                changed = true;
                break;
              }
            }
            if (changed) break;
            continue;
          }
          if ((prev as unknown as Record<string, unknown>)[k as string] !== (nextSettings as unknown as Record<string, unknown>)[k as string]) {
            changed = true;
            break;
          }
        }
        if (!changed) return state;

        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            settings: nextSettings,
            compositions:
              partial.duration !== undefined
                ? Object.fromEntries(
                    Object.entries(state.project.compositions).map(
                      ([id, composition]) => [
                        id,
                        {
                          ...composition,
                          duration: normalizeDuration(
                            partial.duration!,
                            composition.duration,
                          ),
                        },
                      ],
                    ),
                  )
                : state.project.compositions,
            meta: touchMeta(state.project),
          },
        };
      });
    },

    setActiveComposition: (compositionId) => {
      set((state) => {
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;
        return {
          ...prepareHistoryPatch(state),
          project: { ...state.project, activeCompositionId: compositionId },
          selectedLayerId: comp?.layers[0]?.id,
          ...selectionState([]),
        };
      });
    },

    addComposition: (name = "譁ｰ隕上す繝ｼ繝ｳ") => {
      const id = generateId("comp");
      const layerId = generateId("layer");
      const newComp: Composition = {
        id,
        name,
        duration: get().project.settings.duration,
        layers: [
          {
            id: layerId,
            name: "繝ｬ繧､繝､繝ｼ 1",
            type: "normal",
            visible: true,
            locked: false,
            keyframes: [{ frame: 0, tween: "none", elements: [] }],
          },
        ],
        sounds: [],
      };

      set((state) => ({
        ...prepareHistoryPatch(state),
        project: {
          ...state.project,
          compositions: { ...state.project.compositions, [id]: newComp },
          activeCompositionId: id,
          meta: touchMeta(state.project),
        },
        selectedLayerId: layerId,
        ...selectionState([]),
      }));

      return id;
    },
});
