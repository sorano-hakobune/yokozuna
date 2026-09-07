import type { EasingType } from "@/types/project";

/**
 * Extended easing curves (Robert Penner style + CSS-familiar names).
 * Input / output are clamped to [0, 1].
 */

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ---- building blocks ----

function easeInPower(t: number, p: number): number {
  return Math.pow(t, p);
}
function easeOutPower(t: number, p: number): number {
  return 1 - Math.pow(1 - t, p);
}
function easeInOutPower(t: number, p: number): number {
  return t < 0.5
    ? 0.5 * Math.pow(2 * t, p)
    : 1 - 0.5 * Math.pow(2 * (1 - t), p);
}

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const x = t - 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (t < 2.5 / d1) {
    const x = t - 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  const x = t - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;
const C5 = (2 * Math.PI) / 4.5;

/** Map of all registered easing evaluators. */
const EASING_FN: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,

  // Quad (legacy aliases)
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  easeInCubic: (t) => easeInPower(t, 3),
  easeOutCubic: (t) => easeOutPower(t, 3),
  easeInOutCubic: (t) => easeInOutPower(t, 3),

  easeInQuart: (t) => easeInPower(t, 4),
  easeOutQuart: (t) => easeOutPower(t, 4),
  easeInOutQuart: (t) => easeInOutPower(t, 4),

  easeInQuint: (t) => easeInPower(t, 5),
  easeOutQuint: (t) => easeOutPower(t, 5),
  easeInOutQuint: (t) => easeInOutPower(t, 5),

  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  easeInOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  easeInBack: (t) => C3 * t * t * t - C1 * t * t,
  easeOutBack: (t) => 1 + C3 * Math.pow(t - 1, 3) + C1 * Math.pow(t - 1, 2),
  easeInOutBack: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((C2 + 1) * 2 * t - C2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((C2 + 1) * (t * 2 - 2) + C2) + 2) / 2,

  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * C4) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * C5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * C5)) / 2 + 1;
  },

  easeInBounce: (t) => 1 - bounceOut(1 - t),
  easeOutBounce: (t) => bounceOut(t),
  easeInOutBounce: (t) =>
    t < 0.5
      ? (1 - bounceOut(1 - 2 * t)) / 2
      : (1 + bounceOut(2 * t - 1)) / 2,

  custom: (t) => t,
};

/** Default CSS-like ease curve. */
export const DEFAULT_CUBIC_BEZIER: [number, number, number, number] = [
  0.42, 0, 0.58, 1,
];

/**
 * Unit cubic-bezier (CSS): P0=(0,0) P1=(x1,y1) P2=(x2,y2) P3=(1,1).
 * Given time x in [0,1], return progress y.
 */
export function cubicBezierAt(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  const cx = clamp01(x);
  // Linear special-case
  if (x1 === y1 && x2 === y2) return cx;

  // Newton-Raphson on Bx(s) - x = 0
  let s = cx;
  for (let i = 0; i < 8; i++) {
    const u = 1 - s;
    const bx =
      3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s;
    const dx =
      3 * u * u * x1 +
      6 * u * s * (x2 - x1) +
      3 * s * s * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    s -= (bx - cx) / dx;
    s = clamp01(s);
  }
  // Polynomial sample By(s)
  const u = 1 - s;
  return 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s;
}

export function applyEasing(
  t: number,
  easing: EasingType = "linear",
  bezier?: [number, number, number, number] | null,
): number {
  const clamped = clamp01(t);
  if (easing === "custom") {
    const b = bezier ?? DEFAULT_CUBIC_BEZIER;
    return cubicBezierAt(b[0], b[1], b[2], b[3], clamped);
  }
  const fn = EASING_FN[easing] ?? EASING_FN.linear;
  return fn(clamped);
}

/** All valid easing ids (for schemas / menus). */
export const EASING_TYPES: readonly EasingType[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce",
] as const;

export type EasingGroup = {
  label: string;
  options: { value: EasingType; label: string }[];
};

/** Japanese labels grouped for Inspector / context menus. */
export const EASING_GROUPS: EasingGroup[] = [
  {
    label: "カスタム",
    options: [{ value: "custom", label: "cubic-bezier…" }],
  },
  {
    label: "基本",
    options: [
      { value: "linear", label: "リニア" },
      { value: "easeIn", label: "イーズイン（2次）" },
      { value: "easeOut", label: "イーズアウト（2次）" },
      { value: "easeInOut", label: "イーズインアウト（2次）" },
    ],
  },
  {
    label: "正弦",
    options: [
      { value: "easeInSine", label: "Sine In" },
      { value: "easeOutSine", label: "Sine Out" },
      { value: "easeInOutSine", label: "Sine In Out" },
    ],
  },
  {
    label: "3〜5次",
    options: [
      { value: "easeInCubic", label: "Cubic In" },
      { value: "easeOutCubic", label: "Cubic Out" },
      { value: "easeInOutCubic", label: "Cubic In Out" },
      { value: "easeInQuart", label: "Quart In" },
      { value: "easeOutQuart", label: "Quart Out" },
      { value: "easeInOutQuart", label: "Quart In Out" },
      { value: "easeInQuint", label: "Quint In" },
      { value: "easeOutQuint", label: "Quint Out" },
      { value: "easeInOutQuint", label: "Quint In Out" },
    ],
  },
  {
    label: "特殊",
    options: [
      { value: "easeInExpo", label: "Expo In" },
      { value: "easeOutExpo", label: "Expo Out" },
      { value: "easeInOutExpo", label: "Expo In Out" },
      { value: "easeInCirc", label: "Circ In" },
      { value: "easeOutCirc", label: "Circ Out" },
      { value: "easeInOutCirc", label: "Circ In Out" },
      { value: "easeInBack", label: "Back In" },
      { value: "easeOutBack", label: "Back Out" },
      { value: "easeInOutBack", label: "Back In Out" },
      { value: "easeInElastic", label: "Elastic In" },
      { value: "easeOutElastic", label: "Elastic Out" },
      { value: "easeInOutElastic", label: "Elastic In Out" },
      { value: "easeInBounce", label: "Bounce In" },
      { value: "easeOutBounce", label: "Bounce Out" },
      { value: "easeInOutBounce", label: "Bounce In Out" },
    ],
  },
];

export function easingLabel(type: EasingType | undefined): string {
  if (!type) return "リニア";
  if (type === "custom") return "カスタム (cubic-bezier)";
  for (const g of EASING_GROUPS) {
    const hit = g.options.find((o) => o.value === type);
    if (hit) return hit.label;
  }
  return type;
}

/** Flat list for compact context menus (subset of popular curves). */
export const EASING_MENU_SHORT: { value: EasingType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "custom", label: "Custom Bezier" },
  { value: "easeIn", label: "Ease In" },
  { value: "easeOut", label: "Ease Out" },
  { value: "easeInOut", label: "Ease In Out" },
  { value: "easeOutCubic", label: "Cubic Out" },
  { value: "easeInOutCubic", label: "Cubic In Out" },
  { value: "easeOutBack", label: "Back Out" },
  { value: "easeOutElastic", label: "Elastic Out" },
  { value: "easeOutBounce", label: "Bounce Out" },
  { value: "easeInOutSine", label: "Sine In Out" },
];
