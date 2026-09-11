// ==============================
// 基本型
// ==============================

/**
 * Tween easing id. Legacy quad aliases: easeIn / easeOut / easeInOut.
 * See `lib/animation/easing.ts` for evaluators.
 */
export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInQuart"
  | "easeOutQuart"
  | "easeInOutQuart"
  | "easeInQuint"
  | "easeOutQuint"
  | "easeInOutQuint"
  | "easeInSine"
  | "easeOutSine"
  | "easeInOutSine"
  | "easeInExpo"
  | "easeOutExpo"
  | "easeInOutExpo"
  | "easeInCirc"
  | "easeOutCirc"
  | "easeInOutCirc"
  | "easeInBack"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeInElastic"
  | "easeOutElastic"
  | "easeInOutElastic"
  | "easeInBounce"
  | "easeOutBounce"
  | "easeInOutBounce"
  | "custom";
export type TweenType = "none" | "motion" | "shape";
export type LayerType = "normal" | "mask" | "guide" | "folder";
export type SymbolType = "graphic" | "movieClip";
export type ElementType = "instance" | "bitmap" | "shape";
export type ShapeType = "rectangle" | "circle" | "line" | "path" | "text";
export type AssetType = "image" | "audio" | "svg";
export type ToolType =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "freehand"
  | "text"
  | "paintbucket"
  | "eyedropper"
  | "eraser"
  | "hand";

export type TextOrientation = "horizontal" | "vertical";

// ==============================
// 共通
// ==============================

export interface Pivot {
  x: number;
  y: number;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degree
  opacity: number; // 0 ~ 1
  pivot?: Pivot;
}

// ==============================
// 要素（Element）
// ==============================

/**
 * Element visual filters (Animate-style). Applied in order.
 * Numeric ranges are soft; UI clamps to sensible defaults.
 */
export type ElementFilter =
  | {
      type: "blur";
      /** Gaussian blur radius in px (0–40). */
      amount: number;
    }
  | {
      type: "dropShadow";
      dx: number;
      dy: number;
      /** Blur radius px */
      blur: number;
      color: string;
      /** 0–1 */
      opacity: number;
    }
  | {
      type: "glow";
      /** Glow radius px */
      amount: number;
      color: string;
      /** 0–1 */
      opacity: number;
    }
  | {
      type: "brightness";
      /** 0 = black, 1 = normal, 2 = double */
      amount: number;
    }
  | {
      type: "contrast";
      /** 0 = flat gray, 1 = normal, 2 = high */
      amount: number;
    }
  | {
      type: "saturate";
      /** 0 = grayscale, 1 = normal, 2 = vivid */
      amount: number;
    }
  | {
      type: "hueRotate";
      /** Degrees */
      degrees: number;
    };

export interface BaseElement extends Transform {
  id: string;
  type: ElementType;
  name?: string;
  /** Optional visual filters (blur, shadow, color…). */
  filters?: ElementFilter[];
}

export interface InstanceElement extends BaseElement {
  type: "instance";
  symbolId: string;
}

export interface BitmapElement extends BaseElement {
  type: "bitmap";
  assetId: string;
}

/**
 * Path vertex. Optional cubic Bezier handles are offsets from the vertex
 * (local space). Missing handles → straight segment to the neighbor.
 * - handleOut: control point for the segment leaving this vertex
 * - handleIn:  control point for the segment arriving at this vertex
 * - smooth: when true, opposite handle mirrors (Illustrator-style)
 */
export interface PathPoint {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
  /** Keep handles colinear & opposite while editing (default true if both set). */
  smooth?: boolean;
}

/** Color stop on a gradient (offset 0–1). */
export interface GradientStop {
  offset: number;
  color: string;
}

/**
 * Fill gradient in object-bounding-box units (0–1 across local bounds).
 * When present, takes precedence over solid `fill` for the interior paint.
 */
export type GradientFill =
  | {
      type: "linear";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stops: GradientStop[];
    }
  | {
      type: "radial";
      cx: number;
      cy: number;
      r: number;
      stops: GradientStop[];
    };

export interface ShapeElement extends BaseElement {
  type: "shape";
  shapeType: ShapeType;
  fill?: string;
  /** Optional gradient fill (overrides solid fill when set). */
  fillGradient?: GradientFill;
  stroke?: string;
  strokeWidth?: number;
  /** SVG stroke presentation attributes (undefined = renderer default). */
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeMiterlimit?: number;
  strokeDasharray?: number[];
  strokeDashoffset?: number;
  /**
   * Clipping groups in shape-local coords (same frame as `points`).
   * Entries intersect (nested SVG clip-paths); paths within one entry unite.
   */
  clip?: { paths: PathPoint[][] }[];
  width?: number;
  height?: number;
  radius?: number;
  /** Rectangle corner radius (px). */
  cornerRadius?: number;
  /** Path / line vertices (may include Bezier handles). */
  points?: PathPoint[];
  subpaths?: PathPoint[][];
  fillRule?: "nonzero" | "evenodd";
  closePath?: boolean;
  /** shapeType === "text" */
  text?: string;
  textOrientation?: TextOrientation;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
}

export type Element = InstanceElement | BitmapElement | ShapeElement;

// ==============================
// キーフレーム / レイヤー
// ==============================

/**
 * Path that element origins follow during a motion tween.
 * Coordinates are stage space (same as element.x / element.y).
 */
export interface MotionPath {
  points: PathPoint[];
  /** Rotate element to path tangent. */
  orientToPath?: boolean;
}

/** CSS cubic-bezier control points: (x1, y1, x2, y2). */
export type CubicBezierParams = [number, number, number, number];

export interface Keyframe {
  frame: number;
  tween: TweenType;
  easing?: EasingType;
  /**
   * Used when easing === "custom".
   * CSS cubic-bezier(x1, y1, x2, y2) control points.
   */
  easingBezier?: CubicBezierParams;
  elements: Element[];
  /** Optional path for motion tween (ignored unless tween === "motion"). */
  motionPath?: MotionPath;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  keyframes: Keyframe[];
  /**
   * Parent folder layer id. Undefined / missing = root level.
   * Children should be consecutive under the folder in the layers array
   * for predictable z-order (Animate-style).
   */
  parentId?: string;
  /** Folder only: expanded in the timeline list (default true). */
  expanded?: boolean;
}

// ==============================
// アセット / シンボル
// ==============================

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  src: string;
  width?: number;
  height?: number;
  mimeType?: string;
  duration?: number;
}

export interface Symbol {
  id: string;
  name: string;
  type: SymbolType;
  width: number;
  height: number;
  pivot: Pivot;
  duration: number;
  layers: Layer[];
}

// ==============================
// コンポジション / プロジェクト
// ==============================

/**
 * Sound placed on a composition timeline (Flash-style stream sound).
 * Linked to an audio Asset; plays while the playhead is in [startFrame, startFrame + durationFrames).
 */
export interface SoundInstance {
  id: string;
  assetId: string;
  /** First frame where playback begins (inclusive). */
  startFrame: number;
  /** Length in frames. */
  durationFrames: number;
  /** 0 ~ 1 */
  volume: number;
  muted?: boolean;
  name?: string;
}

/** Named marker on the composition timeline (Flash-style frame label). */
export interface FrameLabel {
  id: string;
  frame: number;
  name: string;
  /** Optional accent color (CSS). */
  color?: string;
}

export interface Composition {
  id: string;
  name: string;
  duration: number;
  layers: Layer[];
  /** Optional timeline audio clips (composition-level, not per-layer). */
  sounds?: SoundInstance[];
  /** Timeline frame labels / scene markers. */
  labels?: FrameLabel[];
}

export interface ProjectMeta {
  name: string;
  createdAt: string;
  modifiedAt: string;
  author?: string;
}

/** Stage guide line (ruler-style). Position is in stage pixels. */
export interface GuideLine {
  id: string;
  orientation: "horizontal" | "vertical";
  /** x for vertical, y for horizontal */
  position: number;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  duration: number;
  /** Grid cell size in px (default 20). */
  gridSize?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
  showGuides?: boolean;
  snapToGuides?: boolean;
  guides?: GuideLine[];
}

export interface Project {
  version: string;
  meta: ProjectMeta;
  settings: ProjectSettings;
  assets: Record<string, Asset>;
  symbols: Record<string, Symbol>;
  compositions: Record<string, Composition>;
  activeCompositionId: string;
}
