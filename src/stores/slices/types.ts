import type {
  Asset,
  EasingType,
  Element,
  FrameLabel,
  Keyframe,
  Layer,
  Project,
  ProjectSettings,
  ShapeElement,
  SoundInstance,
  Symbol,
  SymbolType,
  TextOrientation,
  ToolType,
  TweenType,
} from "@/types/project";
import type { AlignMode, DistributeAxis } from "@/lib/selection/alignDistribute";

/** Document + selection snapshot for undo/redo (UI chrome is excluded). */
export interface HistorySnapshot {
  project: Project;
  selectedLayerId: string | undefined;
  selectedElementId: string | undefined;
  selectedElementIds: string[];
  currentFrame: number;
}

export interface HistorySlice {
  /** Undo stack (oldest → newest). */
  past: HistorySnapshot[];
  /** Redo stack. */
  future: HistorySnapshot[];
  _isApplyingHistory: boolean;
  _historyBatchDepth: number;
  _historyBatchPushed: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Group continuous edits (drag/resize) into a single history entry. */
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
}

export interface DocumentSlice {
  project: Project;
  savedContentKey: string;
  isDocumentDirty: () => boolean;
  markProjectSaved: () => void;
  createNewProject: (name?: string) => void;
  loadProject: (project: Project) => void;
  setProject: (project: Project) => void;
  updateMeta: (partial: Partial<Project["meta"]>) => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  setActiveComposition: (compositionId: string) => void;
  addComposition: (name?: string) => string;
}

export interface SelectionSlice {
  selectedLayerId: string | undefined;
  /** Primary selection (last selected) — kept for Inspector / legacy call sites. */
  selectedElementId: string | undefined;
  /** Multi-selection ordered list (primary is last). */
  selectedElementIds: string[];
  setSelectedLayerId: (layerId: string | undefined) => void;
  setSelectedElementId: (elementId: string | undefined) => void;
  setSelectedElementIds: (ids: string[]) => void;
  toggleSelectedElementId: (elementId: string) => void;
  selectAllOnFrame: () => void;
  clearSelection: () => void;
}

export interface ClipboardSlice {
  /** Clipboard holds one or more deep-cloned elements (multi-copy). */
  clipboard: Element[] | null;
  /** Timeline keyframe copy buffer (elements + tween meta). */
  keyframeClipboard: {
    elements: Element[];
    tween: TweenType;
    easing?: EasingType;
  } | null;
  /** Successive paste offset counter (reset on copy). */
  _clipboardPasteGen: number;
  copyElement: (layerId: string, frame: number, elementId: string) => void;
  pasteElement: (layerId: string, frame: number) => void;
  /** Copy current multi-selection (all layers on current frame). */
  copySelection: () => void;
  /** Cut = copySelection + delete selection (one undo step for delete). */
  cutSelection: () => void;
  /** Paste clipboard onto active layer / current frame with stacked offset. */
  pasteClipboard: (layerId?: string, frame?: number) => void;
  /** Duplicate selection in place (+20,+20), same layer(s) approximated onto primary layer. */
  duplicateSelection: () => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (axis: DistributeAxis) => void;
}

export interface UiSlice {
  currentFrame: number;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  selectedTool: ToolType;
  drawingStroke: string;
  drawingStrokeWidth: number;
  drawingFill: string;
  /** Text tool: horizontal vs vertical typesetting */
  textOrientation: TextOrientation;
  /**
   * Explicit path vertex edit mode (double-click a path/line).
   * Vertices are hidden after drawing until this is enabled.
   */
  pathEditMode: boolean;
  pointerPos: { x: number; y: number } | null;
  /** When set, timeline/stage edit this symbol instead of the active composition. */
  editingSymbolId: string | undefined;
  /** Onion skin (ghost frames) authoring aid. */
  onionSkinEnabled: boolean;
  onionSkinBefore: number;
  onionSkinAfter: number;
  enterSymbolEdit: (symbolId: string) => void;
  exitSymbolEdit: () => void;
  setSelectedTool: (tool: ToolType) => void;
  setDrawingStroke: (stroke: string) => void;
  setDrawingFill: (fill: string) => void;
  setTextOrientation: (orientation: TextOrientation) => void;
  setDrawingStrokeWidth: (width: number) => void;
  setPathEditMode: (enabled: boolean) => void;
  setPointerPos: (pos: { x: number; y: number } | null) => void;
  setCurrentFrame: (frame: number) => void;
  setOnionSkinEnabled: (enabled: boolean) => void;
  setOnionSkinBefore: (count: number) => void;
  setOnionSkinAfter: (count: number) => void;
  toggleOnionSkin: () => void;
  setCanvasZoom: (zoom: number) => void;
  zoomCanvas: (zoom: number) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;
}

export interface LayerSlice {
  addLayer: (name?: string, parentId?: string) => string;
  /** Create a folder layer (optionally wrap selected layer). */
  addFolder: (name?: string) => string;
  toggleFolderExpanded: (folderId: string) => void;
  /** Move layer into folder (undefined = root). */
  setLayerParent: (layerId: string, parentId: string | undefined) => void;
  /** Deep-copy a layer (keyframes + elements) and insert below source. */
  duplicateLayer: (layerId: string) => string | undefined;
  updateLayer: (
    layerId: string,
    partial: Partial<Pick<Layer, "name" | "visible" | "locked" | "type">>,
  ) => void;
  removeLayer: (layerId: string) => void;
  reorderLayers: (layerIds: string[]) => void;
}

export interface KeyframeSlice {
  addKeyframe: (layerId: string, frame: number, elements?: Element[]) => void;
  updateKeyframe: (
    layerId: string,
    frame: number,
    partial: Partial<Omit<Keyframe, "frame">>,
  ) => void;
  /** Set motion/shape tween + optional easing on a keyframe (spans to next keyframe). */
  setKeyframeTween: (
    layerId: string,
    frame: number,
    tween: Keyframe["tween"],
    easing?: Keyframe["easing"],
  ) => void;
  setKeyframeMotionPath: (
    layerId: string,
    frame: number,
    motionPath: Keyframe["motionPath"] | undefined,
  ) => void;
  removeKeyframe: (layerId: string, frame: number) => void;
  /** Move an existing keyframe to another empty frame. */
  moveKeyframe: (layerId: string, fromFrame: number, toFrame: number) => void;
  /** Duplicate a keyframe onto an empty frame (keeps element ids for tween continuity). */
  copyKeyframe: (layerId: string, fromFrame: number, toFrame: number) => void;
  /** Copy keyframe content into keyframeClipboard (does not move playhead). */
  captureKeyframeClipboard: (layerId: string, frame: number) => void;
  /** Paste keyframeClipboard onto layer at frame (creates/replaces keyframe). */
  pasteKeyframeClipboard: (layerId: string, frame: number) => void;
  addFrameLabel: (
    frame: number,
    name: string,
    color?: string,
  ) => string | undefined;
  updateFrameLabel: (
    id: string,
    partial: Partial<Pick<FrameLabel, "name" | "frame" | "color">>,
  ) => void;
  removeFrameLabel: (id: string) => void;
  /**
   * Insert empty frames at `atFrame` (Flash F5).
   * scope "layer" = selected layer only; "all" = every layer on the timeline target.
   */
  insertFrames: (
    atFrame: number,
    count?: number,
    scope?: "layer" | "all",
    layerId?: string,
  ) => void;
  /**
   * Remove frames starting at `atFrame` (Flash Shift+F5).
   */
  removeFrames: (
    atFrame: number,
    count?: number,
    scope?: "layer" | "all",
    layerId?: string,
  ) => void;
}

export interface ElementSlice {
  /** 指定フレームにキーフレームが無ければ作成してから要素を追加 */
  ensureKeyframeAndAddElement: (
    layerId: string,
    frame: number,
    element: Element,
  ) => void;
  updateElement: (
    layerId: string,
    frame: number,
    elementId: string,
    partial: Partial<Element>,
  ) => void;
  addShapeToLayer: (
    layerId: string,
    frame: number,
    shape: ShapeElement,
  ) => void;
  removeElement: (layerId: string, frame: number, elementId: string) => void;
  /** Move selected elements to front or back within their keyframe element lists. */
  reorderSelectionZ: (direction: "front" | "back") => void;
  replaceShapeWithFragments: (
    layerId: string,
    frame: number,
    elementId: string,
    fragments: ShapeElement[],
  ) => void;
  addBitmapElement: (
    layerId: string,
    frame: number,
    assetId: string,
    x: number,
    y: number,
  ) => void;
}

export interface AssetSlice {
  addAsset: (asset: Omit<Asset, "id">) => string;
  renameAsset: (assetId: string, name: string) => void;
  deleteAsset: (assetId: string) => void;
  addSymbol: (symbol: Omit<Symbol, "id">) => string;
}

export interface SoundSlice {
  /** Composition-level timeline sounds (ignored while editing a symbol). */
  selectedSoundId: string | undefined;
  setSelectedSoundId: (id: string | undefined) => void;
  addSound: (
    assetId: string,
    startFrame?: number,
    durationFrames?: number,
  ) => string | null;
  updateSound: (
    soundId: string,
    partial: Partial<Omit<SoundInstance, "id">>,
  ) => void;
  removeSound: (soundId: string) => void;
  moveSound: (soundId: string, startFrame: number) => void;
}

export interface SymbolSlice {
  /** Create empty symbol and register in library. */
  createSymbol: (name?: string, type?: SymbolType) => string;
  /**
   * Convert currently selected element(s) on the active layer/frame into a symbol,
   * replace them with a single instance at the selection center (Flash F8-style).
   */
  convertSelectionToSymbol: (name?: string, type?: SymbolType) => string | null;
  /** Place a symbol instance on the stage. */
  addInstanceElement: (
    layerId: string,
    frame: number,
    symbolId: string,
    x: number,
    y: number,
  ) => void;
  renameSymbol: (symbolId: string, name: string) => void;
  deleteSymbol: (symbolId: string) => void;
  duplicateSymbol: (symbolId: string) => string | null;
}

/** Full store state = union of all slices. */
export type ProjectState = HistorySlice &
  DocumentSlice &
  SelectionSlice &
  ClipboardSlice &
  UiSlice &
  LayerSlice &
  KeyframeSlice &
  ElementSlice &
  AssetSlice &
  SoundSlice &
  SymbolSlice;
