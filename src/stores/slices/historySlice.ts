import type { StateCreator } from "zustand";
import type { HistorySlice, ProjectState } from "./types";
import { HISTORY_LIMIT, cloneSnapshot } from "./shared";

export const createHistorySlice: StateCreator<
  ProjectState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
    past: [],
    future: [],
    _isApplyingHistory: false,
    _historyBatchDepth: 0,
    _historyBatchPushed: false,
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
    beginHistoryBatch: () => {
      set((state) => {
        if (state._historyBatchDepth === 0) {
          return {
            _historyBatchDepth: 1,
            _historyBatchPushed: false,
          };
        }
        return { _historyBatchDepth: state._historyBatchDepth + 1 };
      });
    },

    endHistoryBatch: () => {
      set((state) => {
        if (state._historyBatchDepth <= 0) return state;
        const next = Math.max(0, state._historyBatchDepth - 1);
        return {
          _historyBatchDepth: next,
          ...(next === 0 ? { _historyBatchPushed: false } : {}),
        };
      });
    },
    undo: () => {
      set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1]!;
        const current = cloneSnapshot(state);
        return {
          past: state.past.slice(0, -1),
          future: [...state.future, current].slice(-HISTORY_LIMIT),
          project: previous.project,
          selectedLayerId: previous.selectedLayerId,
          selectedElementId: previous.selectedElementId,
          selectedElementIds: previous.selectedElementIds ?? (previous.selectedElementId ? [previous.selectedElementId] : []),
          currentFrame: previous.currentFrame,
          _historyBatchDepth: 0,
          _historyBatchPushed: false,
        };
      });
    },

    redo: () => {
      set((state) => {
        if (state.future.length === 0) return state;
        const next = state.future[state.future.length - 1]!;
        const current = cloneSnapshot(state);
        return {
          future: state.future.slice(0, -1),
          past: [...state.past, current].slice(-HISTORY_LIMIT),
          project: next.project,
          selectedLayerId: next.selectedLayerId,
          selectedElementId: next.selectedElementId,
          selectedElementIds: next.selectedElementIds ?? (next.selectedElementId ? [next.selectedElementId] : []),
          currentFrame: next.currentFrame,
          _historyBatchDepth: 0,
          _historyBatchPushed: false,
        };
      });
    },
});
