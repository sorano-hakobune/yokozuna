import type { HandleId } from "../transformGeometry";
import type { GuideLine } from "@/types/project";

/** Pointer transform session for single/multi element drag. */
export type TransformSession = {
  handle: HandleId | "marquee";
  elementId: string;
  layerId: string;
  startPointer: { x: number; y: number };
  initialX: number;
  initialY: number;
  initialRotation: number;
  initialScaleX: number;
  initialScaleY: number;
  /** Angle offset so rotation feels continuous from grab point */
  rotationGrabOffset: number;
  /** Pivot at drag start (local space); used by pivot handle */
  initialPivot?: { x: number; y: number };
  /** Multi-select transform: all selected items' starting state */
  multiItems?: Array<{
    layerId: string;
    elementId: string;
    initialX: number;
    initialY: number;
    initialRotation: number;
    initialScaleX: number;
    initialScaleY: number;
  }>;
  /** Group transform pivot / start AABB (multi scale/rotate) */
  groupCenter?: { x: number; y: number };
  groupBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    cx: number;
    cy: number;
  };
};

export type MarqueeSession = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  additive: boolean;
};

export type VertexSession = {
  layerId: string;
  elementId: string;
  index: number;
  /** vertex | handleIn | handleOut */
  kind: "vertex" | "handleIn" | "handleOut";
  /** Alt = break smooth pairing while dragging handles */
  breakSmooth?: boolean;
};

export type LayerMoveSession = {
  layerId: string;
  startPointer: { x: number; y: number };
  items: { elementId: string; initialX: number; initialY: number }[];
};

export type GuideDragSession = {
  id: string;
  orientation: GuideLine["orientation"];
};
