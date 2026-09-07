import type { ElementFilter } from "@/types/project";

export const FILTER_TYPE_LABELS: Record<ElementFilter["type"], string> = {
  blur: "ぼかし",
  dropShadow: "ドロップシャドウ",
  glow: "グロー",
  brightness: "明るさ",
  contrast: "コントラスト",
  saturate: "彩度",
  hueRotate: "色相回転",
};

export function defaultFilter(type: ElementFilter["type"]): ElementFilter {
  switch (type) {
    case "blur":
      return { type: "blur", amount: 4 };
    case "dropShadow":
      return {
        type: "dropShadow",
        dx: 4,
        dy: 4,
        blur: 6,
        color: "#000000",
        opacity: 0.45,
      };
    case "glow":
      return { type: "glow", amount: 8, color: "#e05a3c", opacity: 0.7 };
    case "brightness":
      return { type: "brightness", amount: 1.15 };
    case "contrast":
      return { type: "contrast", amount: 1.2 };
    case "saturate":
      return { type: "saturate", amount: 1.3 };
    case "hueRotate":
      return { type: "hueRotate", degrees: 30 };
  }
}

/** CSS `filter` property value for Canvas / HTML (export + fallback). */
export function filtersToCss(filters: ElementFilter[] | undefined): string {
  if (!filters?.length) return "none";
  const parts: string[] = [];
  for (const f of filters) {
    switch (f.type) {
      case "blur":
        if (f.amount > 0) parts.push(`blur(${f.amount}px)`);
        break;
      case "dropShadow":
        parts.push(
          `drop-shadow(${f.dx}px ${f.dy}px ${f.blur}px ${hexWithAlpha(f.color, f.opacity)})`,
        );
        break;
      case "glow":
        // Approximate glow as centered drop-shadows
        parts.push(
          `drop-shadow(0 0 ${f.amount}px ${hexWithAlpha(f.color, f.opacity)})`,
        );
        parts.push(
          `drop-shadow(0 0 ${f.amount * 0.5}px ${hexWithAlpha(f.color, f.opacity)})`,
        );
        break;
      case "brightness":
        parts.push(`brightness(${f.amount})`);
        break;
      case "contrast":
        parts.push(`contrast(${f.amount})`);
        break;
      case "saturate":
        parts.push(`saturate(${f.amount})`);
        break;
      case "hueRotate":
        parts.push(`hue-rotate(${f.degrees}deg)`);
        break;
    }
  }
  return parts.length ? parts.join(" ") : "none";
}

function hexWithAlpha(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity));
  const hex = color.trim();
  // #rgb / #rrggbb
  if (hex.startsWith("#")) {
    let r = 0;
    let g = 0;
    let b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1]! + hex[1]!, 16);
      g = parseInt(hex[2]! + hex[2]!, 16);
      b = parseInt(hex[3]! + hex[3]!, 16);
    } else if (hex.length >= 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  if (hex.startsWith("rgb")) {
    // naive: wrap as rgba if rgb(
    const m = hex.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const nums = m[1]!.split(",").map((s) => s.trim());
      return `rgba(${nums[0]},${nums[1]},${nums[2]},${a})`;
    }
  }
  return color;
}

/**
 * Build SVG <filter> children as React-friendly descriptor objects.
 * Caller renders them under <filter id={filterId}>.
 */
export type SvgFilterPrimitive =
  | {
      kind: "blur";
      result: string;
      stdDeviation: number;
      in?: string;
    }
  | {
      kind: "offset";
      result: string;
      dx: number;
      dy: number;
      in?: string;
    }
  | {
      kind: "flood";
      result: string;
      color: string;
      opacity: number;
    }
  | {
      kind: "composite";
      result: string;
      operator: string;
      in?: string;
      in2?: string;
    }
  | {
      kind: "merge";
      result: string;
      nodes: string[];
    }
  | {
      kind: "colorMatrix";
      result: string;
      values: string;
      in?: string;
    }
  | {
      kind: "componentTransfer";
      result: string;
      slope: number;
      intercept: number;
      in?: string;
    };

export function filtersToSvgPrimitives(
  filters: ElementFilter[],
): { primitives: SvgFilterPrimitive[]; finalResult: string } {
  let input = "SourceGraphic";
  const primitives: SvgFilterPrimitive[] = [];
  let i = 0;
  const next = (prefix: string) => `${prefix}${i++}`;

  for (const f of filters) {
    switch (f.type) {
      case "blur": {
        if (f.amount <= 0) break;
        const r = next("blur");
        primitives.push({
          kind: "blur",
          result: r,
          stdDeviation: f.amount,
          in: input,
        });
        input = r;
        break;
      }
      case "dropShadow": {
        const blurR = next("sBlur");
        const offR = next("sOff");
        const floodR = next("sFlood");
        const compR = next("sComp");
        const mergeR = next("sMerge");
        primitives.push({
          kind: "blur",
          result: blurR,
          stdDeviation: f.blur,
          in: "SourceAlpha",
        });
        primitives.push({
          kind: "offset",
          result: offR,
          dx: f.dx,
          dy: f.dy,
          in: blurR,
        });
        primitives.push({
          kind: "flood",
          result: floodR,
          color: f.color,
          opacity: f.opacity,
        });
        primitives.push({
          kind: "composite",
          result: compR,
          operator: "in",
          in: floodR,
          in2: offR,
        });
        primitives.push({
          kind: "merge",
          result: mergeR,
          nodes: [compR, input],
        });
        input = mergeR;
        break;
      }
      case "glow": {
        const blurR = next("gBlur");
        const floodR = next("gFlood");
        const compR = next("gComp");
        const mergeR = next("gMerge");
        primitives.push({
          kind: "blur",
          result: blurR,
          stdDeviation: f.amount,
          in: "SourceAlpha",
        });
        primitives.push({
          kind: "flood",
          result: floodR,
          color: f.color,
          opacity: f.opacity,
        });
        primitives.push({
          kind: "composite",
          result: compR,
          operator: "in",
          in: floodR,
          in2: blurR,
        });
        primitives.push({
          kind: "merge",
          result: mergeR,
          nodes: [compR, input],
        });
        input = mergeR;
        break;
      }
      case "brightness": {
        // linear: slope = amount, intercept = 0 (simplified)
        const r = next("bri");
        const amt = f.amount;
        primitives.push({
          kind: "componentTransfer",
          result: r,
          slope: amt,
          intercept: 0,
          in: input,
        });
        input = r;
        break;
      }
      case "contrast": {
        // contrast: slope = amount, intercept = 0.5*(1-amount)
        const r = next("con");
        const amt = f.amount;
        primitives.push({
          kind: "componentTransfer",
          result: r,
          slope: amt,
          intercept: 0.5 * (1 - amt),
          in: input,
        });
        input = r;
        break;
      }
      case "saturate": {
        const r = next("sat");
        // feColorMatrix type=saturate uses values as single number — we encode as matrix
        const s = f.amount;
        const a = 0.213;
        const b = 0.715;
        const c = 0.072;
        const m = [
          a + (1 - a) * s,
          b * (1 - s),
          c * (1 - s),
          0,
          0,
          a * (1 - s),
          b + (1 - b) * s,
          c * (1 - s),
          0,
          0,
          a * (1 - s),
          b * (1 - s),
          c + (1 - c) * s,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
        ];
        primitives.push({
          kind: "colorMatrix",
          result: r,
          values: m.join(" "),
          in: input,
        });
        input = r;
        break;
      }
      case "hueRotate": {
        const r = next("hue");
        const rad = (f.degrees * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const a00 = 0.213 + cos * 0.787 - sin * 0.213;
        const a01 = 0.715 - cos * 0.715 - sin * 0.715;
        const a02 = 0.072 - cos * 0.072 + sin * 0.928;
        const a10 = 0.213 - cos * 0.213 + sin * 0.143;
        const a11 = 0.715 + cos * 0.285 + sin * 0.14;
        const a12 = 0.072 - cos * 0.072 - sin * 0.283;
        const a20 = 0.213 - cos * 0.213 - sin * 0.787;
        const a21 = 0.715 - cos * 0.715 + sin * 0.715;
        const a22 = 0.072 + cos * 0.928 + sin * 0.072;
        const m = [
          a00,
          a01,
          a02,
          0,
          0,
          a10,
          a11,
          a12,
          0,
          0,
          a20,
          a21,
          a22,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
        ];
        primitives.push({
          kind: "colorMatrix",
          result: r,
          values: m.join(" "),
          in: input,
        });
        input = r;
        break;
      }
    }
  }

  return { primitives, finalResult: input };
}

/** Interpolate matching filter stacks (same types/order). */
export function lerpFilters(
  a: ElementFilter[] | undefined,
  b: ElementFilter[] | undefined,
  t: number,
): ElementFilter[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  if (!a?.length) return b ? [...b] : undefined;
  if (!b?.length) return [...a];
  const n = Math.min(a.length, b.length);
  const out: ElementFilter[] = [];
  for (let i = 0; i < n; i++) {
    const fa = a[i]!;
    const fb = b[i]!;
    if (fa.type !== fb.type) {
      out.push(t < 0.5 ? fa : fb);
      continue;
    }
    switch (fa.type) {
      case "blur":
        out.push({
          type: "blur",
          amount: lerp(fa.amount, (fb as typeof fa).amount, t),
        });
        break;
      case "dropShadow": {
        const bb = fb as typeof fa;
        out.push({
          type: "dropShadow",
          dx: lerp(fa.dx, bb.dx, t),
          dy: lerp(fa.dy, bb.dy, t),
          blur: lerp(fa.blur, bb.blur, t),
          color: t < 0.5 ? fa.color : bb.color,
          opacity: lerp(fa.opacity, bb.opacity, t),
        });
        break;
      }
      case "glow": {
        const bb = fb as typeof fa;
        out.push({
          type: "glow",
          amount: lerp(fa.amount, bb.amount, t),
          color: t < 0.5 ? fa.color : bb.color,
          opacity: lerp(fa.opacity, bb.opacity, t),
        });
        break;
      }
      case "brightness":
        out.push({
          type: "brightness",
          amount: lerp(fa.amount, (fb as typeof fa).amount, t),
        });
        break;
      case "contrast":
        out.push({
          type: "contrast",
          amount: lerp(fa.amount, (fb as typeof fa).amount, t),
        });
        break;
      case "saturate":
        out.push({
          type: "saturate",
          amount: lerp(fa.amount, (fb as typeof fa).amount, t),
        });
        break;
      case "hueRotate":
        out.push({
          type: "hueRotate",
          degrees: lerp(fa.degrees, (fb as typeof fa).degrees, t),
        });
        break;
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
