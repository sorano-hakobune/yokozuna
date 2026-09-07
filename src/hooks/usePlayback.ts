import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useFps, useCompositionDuration } from "@/stores/projectSelectors";
import { useAudioSync } from "./useAudioSync";

const LOOP_STORAGE_KEY = "yokozuna.playback.loop";

function readStoredLoop(): boolean {
  try {
    const v = localStorage.getItem(LOOP_STORAGE_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export const usePlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLoopingState] = useState(readStoredLoop);

  const fps = useFps();
  const maxFrames = useCompositionDuration();

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const setIsLooping = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setIsLoopingState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(LOOP_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const play = useCallback(() => {
    const state = useProjectStore.getState();
    const duration = Math.max(1, maxFrames);
    // At last frame with loop: wrap to start so PLAY does not immediately stop
    if (isLooping && state.currentFrame >= duration - 1) {
      state.setCurrentFrame(0);
    }
    setIsPlaying(true);
  }, [isLooping, maxFrames]);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (prev) return false;
      const state = useProjectStore.getState();
      const duration = Math.max(1, maxFrames);
      if (isLooping && state.currentFrame >= duration - 1) {
        state.setCurrentFrame(0);
      }
      return true;
    });
  }, [isLooping, maxFrames]);
  const toggleLoop = useCallback(() => setIsLooping((prev) => !prev), [setIsLooping]);

  // Sync timeline audio clips while playing
  useAudioSync(isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const duration = Math.max(1, maxFrames);
    const frameInterval = 1000 / Math.max(1, fps);

    const animate = (time: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = time;
      }

      const elapsed = time - lastTimeRef.current;

      if (elapsed >= frameInterval) {
        const framesToAdvance = Math.floor(elapsed / frameInterval);
        lastTimeRef.current = time - (elapsed % frameInterval);

        const storeState = useProjectStore.getState();
        let nextFrame = storeState.currentFrame + framesToAdvance;

        if (nextFrame >= duration) {
          if (isLooping) {
            nextFrame = nextFrame % duration;
          } else {
            nextFrame = duration - 1;
            setIsPlaying(false);
            storeState.setCurrentFrame(nextFrame);
            return;
          }
        }

        storeState.setCurrentFrame(nextFrame);
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, fps, maxFrames, isLooping]);

  return {
    isPlaying,
    isLooping,
    play,
    pause,
    togglePlay,
    setIsLooping,
    toggleLoop,
  };
};
