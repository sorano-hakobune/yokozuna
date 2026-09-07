import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useFps, useCompositionDuration } from "@/stores/projectSelectors";

export const usePlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);

  const fps = useFps();
  const maxFrames = useCompositionDuration();

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((prev) => !prev), []);

  useEffect(() => {
    if (!isPlaying) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

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

        if (nextFrame >= maxFrames) {
          if (isLooping) {
            nextFrame = 0;
          } else {
            nextFrame = Math.max(0, maxFrames - 1);
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
  };
};
