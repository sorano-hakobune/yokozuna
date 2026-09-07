import { create } from "zustand";
import type { ProjectState } from "./slices/types";
import { createHistorySlice } from "./slices/historySlice";
import { createDocumentSlice } from "./slices/documentSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createClipboardSlice } from "./slices/clipboardSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createLayerSlice } from "./slices/layerSlice";
import { createKeyframeSlice } from "./slices/keyframeSlice";
import { createElementSlice } from "./slices/elementSlice";
import { createAssetSlice } from "./slices/assetSlice";
import { createSoundSlice } from "./slices/soundSlice";
import { createSymbolSlice } from "./slices/symbolSlice";

export const useProjectStore = create<ProjectState>()((...a) => ({
  ...createHistorySlice(...a),
  ...createDocumentSlice(...a),
  ...createSelectionSlice(...a),
  ...createClipboardSlice(...a),
  ...createUiSlice(...a),
  ...createLayerSlice(...a),
  ...createKeyframeSlice(...a),
  ...createElementSlice(...a),
  ...createAssetSlice(...a),
  ...createSoundSlice(...a),
  ...createSymbolSlice(...a),
}));

// Re-exported for compatibility (types now live in ./slices/types).
export type { ProjectState, HistorySnapshot } from "./slices/types";
