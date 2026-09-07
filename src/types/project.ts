// ==============================
// 基本型
// ==============================

export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type TweenType = "none" | "motion" | "shape";
export type LayerType = "normal" | "mask" | "guide";
export type SymbolType = "graphic" | "movieClip";
export type ElementType = "instance" | "bitmap" | "shape";
export type ShapeType = "rectangle" | "circle" | "line" | "path";
export type AssetType = "image" | "audio" | "svg";
export type ToolType = "select" | "rectangle" | "circle" | "line";

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

export interface BaseElement extends Transform {
  id: string;
  type: ElementType;
  name?: string;
}

export interface InstanceElement extends BaseElement {
  type: "instance";
  symbolId: string;
}

export interface BitmapElement extends BaseElement {
  type: "bitmap";
  assetId: string;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shapeType: ShapeType;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: { x: number; y: number }[];
  closePath?: boolean;
}

export type Element = InstanceElement | BitmapElement | ShapeElement;

// ==============================
// キーフレーム / レイヤー
// ==============================

export interface Keyframe {
  frame: number;
  tween: TweenType;
  easing?: EasingType;
  elements: Element[];
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  keyframes: Keyframe[];
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

export interface Composition {
  id: string;
  name: string;
  duration: number;
  layers: Layer[];
}

export interface ProjectMeta {
  name: string;
  createdAt: string;
  modifiedAt: string;
  author?: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  duration: number;
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
