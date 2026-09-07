import type { Project, Composition, Layer, Keyframe } from "@/types/project";

export function createEmptyProject(name = "無題のプロジェクト"): Project {
  const now = new Date().toISOString();
  const mainCompId = "comp_main";
  const firstLayerId = "layer_1";

  const initialKeyframe: Keyframe = {
    frame: 0,
    tween: "none",
    elements: [],
  };

  const initialLayer: Layer = {
    id: firstLayerId,
    name: "レイヤー 1",
    type: "normal",
    visible: true,
    locked: false,
    keyframes: [initialKeyframe],
  };

  const mainComposition: Composition = {
    id: mainCompId,
    name: "シーン 1",
    duration: 120,
    layers: [initialLayer],
    sounds: [],
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
      width: 550,
      height: 400,
      fps: 24,
      backgroundColor: "#ffffff",
      duration: 120,
      gridSize: 20,
      showGrid: false,
      snapToGrid: false,
      showGuides: true,
      snapToGuides: true,
      guides: [],
    },
    assets: {},
    symbols: {},
    compositions: {
      [mainCompId]: mainComposition,
    },
    activeCompositionId: mainCompId,
  };
}
