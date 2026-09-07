import { create } from "zustand";
import type {
  Project,
  Composition,
  Layer,
  Keyframe,
  Element,
  Symbol,
  Asset,
  ProjectSettings,
  ShapeElement,
  ToolType,
} from "@/types/project";
import { createEmptyProject, generateId } from "@/lib/project";

interface ProjectState {
  project: Project;
  currentFrame: number;
  selectedLayerId: string | undefined;
  selectedElementId: string | undefined;
  clipboard: Element | null;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  selectedTool: ToolType;

  setSelectedTool: (tool: ToolType) => void;
  setSelectedLayerId: (layerId: string | undefined) => void;
  setSelectedElementId: (elementId: string | undefined) => void;
  setCurrentFrame: (frame: number) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;

  copyElement: (layerId: string, frame: number, elementId: string) => void;
  pasteElement: (layerId: string, frame: number) => void;

  createNewProject: (name?: string) => void;
  loadProject: (project: Project) => void;
  setProject: (project: Project) => void;
  updateMeta: (partial: Partial<Project["meta"]>) => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;

  setActiveComposition: (compositionId: string) => void;
  addComposition: (name?: string) => string;

  addLayer: (name?: string) => string;
  updateLayer: (
    layerId: string,
    partial: Partial<Pick<Layer, "name" | "visible" | "locked" | "type">>
  ) => void;
  removeLayer: (layerId: string) => void;
  reorderLayers: (layerIds: string[]) => void;

  addKeyframe: (layerId: string, frame: number, elements?: Element[]) => void;
  updateKeyframe: (
    layerId: string,
    frame: number,
    partial: Partial<Omit<Keyframe, "frame">>
  ) => void;
  removeKeyframe: (layerId: string, frame: number) => void;
  moveKeyframe: (
    layerId: string,
    fromFrame: number,
    toFrame: number
  ) => void;

  /** 指定フレームにキーフレームが無ければ作成してから要素を追加 */
  ensureKeyframeAndAddElement: (
    layerId: string,
    frame: number,
    element: Element
  ) => void;

  updateElement: (
    layerId: string,
    frame: number,
    elementId: string,
    partial: Partial<Element>
  ) => void;
  addShapeToLayer: (
    layerId: string,
    frame: number,
    shape: ShapeElement
  ) => void;
  removeElement: (
    layerId: string,
    frame: number,
    elementId: string
  ) => void;
  addBitmapElement: (
    layerId: string,
    frame: number,
    assetId: string,
    x: number,
    y: number
  ) => void;

  addAsset: (asset: Omit<Asset, "id">) => string;
  addSymbol: (symbol: Omit<Symbol, "id">) => string;
}

function getActiveComp(state: { project: Project }): Composition | null {
  return state.project.compositions[state.project.activeCompositionId] ?? null;
}

function touchMeta(project: Project): Project["meta"] {
  return {
    ...project.meta,
    modifiedAt: new Date().toISOString(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const initial = createEmptyProject();
  const initialLayerId = Object.values(initial.compositions)[0]?.layers[0]?.id;

  return {
    project: initial,
    currentFrame: 0,
    selectedLayerId: initialLayerId,
    selectedElementId: undefined,
    clipboard: null,
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    selectedTool: "select",

    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setSelectedLayerId: (layerId) => set({ selectedLayerId: layerId }),
    setSelectedElementId: (elementId) => set({ selectedElementId: elementId }),
    setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, frame) }),
    setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),
    setCanvasPan: (pan) => set({ canvasPan: pan }),

    copyElement: (layerId, frame, elementId) => {
      const comp = getActiveComp(get());
      if (!comp) return;
      const layer = comp.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const kf = layer.keyframes.find((k) => k.frame === frame);
      if (!kf) return;
      const el = kf.elements.find((e) => e.id === elementId);
      if (!el) return;
      set({ clipboard: JSON.parse(JSON.stringify(el)) });
    },

    pasteElement: (layerId, frame) => {
      const clipboard = get().clipboard;
      if (!clipboard) return;
      const newElement: Element = {
        ...JSON.parse(JSON.stringify(clipboard)),
        id: generateId("el"),
        x: (clipboard.x ?? 0) + 20,
        y: (clipboard.y ?? 0) + 20,
      };
      get().ensureKeyframeAndAddElement(layerId, frame, newElement);
    },

    createNewProject: (name) => {
      const project = createEmptyProject(name);
      const layerId = Object.values(project.compositions)[0]?.layers[0]?.id;
      set({
        project,
        currentFrame: 0,
        selectedLayerId: layerId,
        selectedElementId: undefined,
        clipboard: null,
      });
    },

    loadProject: (project) => {
      const layerId =
        project.compositions[project.activeCompositionId]?.layers[0]?.id;
      set({
        project,
        currentFrame: 0,
        selectedLayerId: layerId,
        selectedElementId: undefined,
      });
    },

    setProject: (project) => {
      const layerId =
        project.compositions[project.activeCompositionId]?.layers[0]?.id;
      set({
        project,
        selectedLayerId: layerId,
        selectedElementId: undefined,
      });
    },

    updateMeta: (partial) => {
      set((state) => ({
        project: {
          ...state.project,
          meta: { ...state.project.meta, ...partial, modifiedAt: new Date().toISOString() },
        },
      }));
    },

    updateSettings: (partial) => {
      set((state) => ({
        project: {
          ...state.project,
          settings: { ...state.project.settings, ...partial },
          meta: touchMeta(state.project),
        },
      }));
    },

    setActiveComposition: (compositionId) => {
      set((state) => {
        const comp = state.project.compositions[compositionId];
        return {
          project: { ...state.project, activeCompositionId: compositionId },
          selectedLayerId: comp?.layers[0]?.id,
          selectedElementId: undefined,
        };
      });
    },

    addComposition: (name = "New Composition") => {
      const id = generateId("comp");
      const layerId = generateId("layer");
      const newComp: Composition = {
        id,
        name,
        duration: get().project.settings.duration,
        layers: [
          {
            id: layerId,
            name: "Layer 1",
            type: "normal",
            visible: true,
            locked: false,
            keyframes: [{ frame: 0, tween: "none", elements: [] }],
          },
        ],
      };

      set((state) => ({
        project: {
          ...state.project,
          compositions: { ...state.project.compositions, [id]: newComp },
          activeCompositionId: id,
          meta: touchMeta(state.project),
        },
        selectedLayerId: layerId,
        selectedElementId: undefined,
      }));

      return id;
    },

    addLayer: (name = "New Layer") => {
      const id = generateId("layer");
      const newLayer: Layer = {
        id,
        name,
        type: "normal",
        visible: true,
        locked: false,
        keyframes: [{ frame: 0, tween: "none", elements: [] }],
      };

      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: [...comp.layers, newLayer],
              },
            },
            meta: touchMeta(state.project),
          },
          selectedLayerId: id,
        };
      });

      return id;
    },

    updateLayer: (layerId, partial) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) =>
                  layer.id === layerId ? { ...layer, ...partial } : layer
                ),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    removeLayer: (layerId) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp || comp.layers.length <= 1) return state;

        const newLayers = comp.layers.filter((l) => l.id !== layerId);
        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: { ...comp, layers: newLayers },
            },
            meta: touchMeta(state.project),
          },
          selectedLayerId:
            state.selectedLayerId === layerId
              ? newLayers[0]?.id
              : state.selectedLayerId,
          selectedElementId:
            state.selectedLayerId === layerId
              ? undefined
              : state.selectedElementId,
        };
      });
    },

    reorderLayers: (layerIds) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        const map = new Map(comp.layers.map((l) => [l.id, l]));
        const newLayers = layerIds
          .map((id) => map.get(id))
          .filter((l): l is Layer => !!l);

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: { ...comp, layers: newLayers },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    addKeyframe: (layerId, frame, elements = []) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.keyframes.some((kf) => kf.frame === frame)) {
                    return layer;
                  }
                  const newKeyframe: Keyframe = {
                    frame,
                    tween: "none",
                    elements,
                  };
                  return {
                    ...layer,
                    keyframes: [...layer.keyframes, newKeyframe].sort(
                      (a, b) => a.frame - b.frame
                    ),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    updateKeyframe: (layerId, frame, partial) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.map((kf) =>
                      kf.frame === frame ? { ...kf, ...partial } : kf
                    ),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    removeKeyframe: (layerId, frame) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (frame === 0 && layer.keyframes.length <= 1) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.filter((kf) => kf.frame !== frame),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    moveKeyframe: (layerId, fromFrame, toFrame) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.keyframes.some((kf) => kf.frame === toFrame)) {
                    return layer;
                  }
                  return {
                    ...layer,
                    keyframes: layer.keyframes
                      .map((kf) =>
                        kf.frame === fromFrame ? { ...kf, frame: toFrame } : kf
                      )
                      .sort((a, b) => a.frame - b.frame),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    ensureKeyframeAndAddElement: (layerId, frame, element) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;

                  const exists = layer.keyframes.some((kf) => kf.frame === frame);
                  if (exists) {
                    return {
                      ...layer,
                      keyframes: layer.keyframes.map((kf) =>
                        kf.frame === frame
                          ? { ...kf, elements: [...kf.elements, element] }
                          : kf
                      ),
                    };
                  }

                  // 直前のキーフレームの要素をコピーして新キーフレームを作る
                  const sorted = [...layer.keyframes].sort(
                    (a, b) => a.frame - b.frame
                  );
                  let baseElements: Element[] = [];
                  for (const kf of sorted) {
                    if (kf.frame <= frame) baseElements = kf.elements;
                    else break;
                  }

                  const newKf: Keyframe = {
                    frame,
                    tween: "none",
                    elements: [
                      ...baseElements.map((e) =>
                        JSON.parse(JSON.stringify(e))
                      ),
                      element,
                    ],
                  };

                  return {
                    ...layer,
                    keyframes: [...layer.keyframes, newKf].sort(
                      (a, b) => a.frame - b.frame
                    ),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
          selectedElementId: element.id,
        };
      });
    },

    updateElement: (layerId, frame, elementId, partial) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.map((kf) => {
                      if (kf.frame !== frame) return kf;
                      return {
                        ...kf,
                        elements: kf.elements.map((el) =>
                          el.id === elementId
                            ? ({ ...el, ...partial } as Element)
                            : el
                        ),
                      };
                    }),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    addShapeToLayer: (layerId, frame, shape) => {
      get().ensureKeyframeAndAddElement(layerId, frame, shape);
    },

    removeElement: (layerId, frame, elementId) => {
      set((state) => {
        const compositionId = state.project.activeCompositionId;
        const comp = state.project.compositions[compositionId];
        if (!comp) return state;

        return {
          project: {
            ...state.project,
            compositions: {
              ...state.project.compositions,
              [compositionId]: {
                ...comp,
                layers: comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  return {
                    ...layer,
                    keyframes: layer.keyframes.map((kf) => {
                      if (kf.frame !== frame) return kf;
                      return {
                        ...kf,
                        elements: kf.elements.filter((el) => el.id !== elementId),
                      };
                    }),
                  };
                }),
              },
            },
            meta: touchMeta(state.project),
          },
          selectedElementId:
            state.selectedElementId === elementId
              ? undefined
              : state.selectedElementId,
        };
      });
    },

    addBitmapElement: (layerId, frame, assetId, x, y) => {
      const bitmap: Element = {
        id: generateId("el"),
        type: "bitmap",
        assetId,
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      };
      get().ensureKeyframeAndAddElement(layerId, frame, bitmap);
    },

    addAsset: (assetData) => {
      const id = generateId("asset");
      set((state) => ({
        project: {
          ...state.project,
          assets: { ...state.project.assets, [id]: { ...assetData, id } },
          meta: touchMeta(state.project),
        },
      }));
      return id;
    },

    addSymbol: (symbolData) => {
      const id = generateId("sym");
      set((state) => ({
        project: {
          ...state.project,
          symbols: { ...state.project.symbols, [id]: { ...symbolData, id } },
          meta: touchMeta(state.project),
        },
      }));
      return id;
    },
  };
});
