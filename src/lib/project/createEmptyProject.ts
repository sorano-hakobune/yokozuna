import type { Project, Composition, Layer, Keyframe } from "@/types/project";
import { generateId } from "./generateId";

export function createEmptyProject(name = "Untitled Project"): Project {
  const now = new Date().toISOString();
  const mainCompId = generateId("comp");
  const firstLayerId = generateId("layer");

  const initialKeyframe: Keyframe = {
    frame: 0,
    tween: "none",
    elements: [],
  };

  const initialLayer: Layer = {
    id: firstLayerId,
    name: "Layer 1",
    type: "normal",
    visible: true,
    locked: false,
    keyframes: [initialKeyframe],
  };

  const mainComposition: Composition = {
    id: mainCompId,
    name: "Main Timeline",
    duration: 240,
    layers: [initialLayer],
  };

  return {
    version: "1.0.0",
    meta: {
      name,
      createdAt: now,
      modifiedAt: now,
      author: "",
    },
    settings: {
      width: 1920,
      height: 1080,
      fps: 24,
      backgroundColor: "#ffffff",
      duration: 240,
    },
    assets: {},
    symbols: {},
    compositions: {
      [mainCompId]: mainComposition,
    },
    activeCompositionId: mainCompId,
  };
}
