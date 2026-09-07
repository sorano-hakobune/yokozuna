import type { Element, Keyframe, EasingType, TweenType } from "@/types/project";

/**
 * イージング関数
 */
function applyEasing(t: number, easing: EasingType = "linear"): number {
  switch (easing) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "linear":
    default:
      return t;
  }
}

export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

/**
 * 2つの要素を補間する（同じ id の要素同士）
 */
function interpolateElement(
  a: Element,
  b: Element,
  t: number
): Element {
  const base = {
    ...a,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scaleX: lerp(a.scaleX, b.scaleX, t),
    scaleY: lerp(a.scaleY, b.scaleY, t),
    rotation: lerp(a.rotation, b.rotation, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };

  if (a.type === "shape" && b.type === "shape") {
    return {
      ...base,
      type: "shape",
      shapeType: a.shapeType,
      fill: a.fill,
      stroke: a.stroke,
      strokeWidth: a.strokeWidth,
      width:
        a.width != null && b.width != null
          ? lerp(a.width, b.width, t)
          : a.width,
      height:
        a.height != null && b.height != null
          ? lerp(a.height, b.height, t)
          : a.height,
      radius:
        a.radius != null && b.radius != null
          ? lerp(a.radius, b.radius, t)
          : a.radius,
      points: a.points,
      closePath: a.closePath,
    };
  }

  return base as Element;
}

/**
 * 指定フレームにおけるレイヤー上の要素一覧を取得（トゥイーン補間付き）
 */
export function getElementsAtFrame(
  keyframes: Keyframe[],
  currentFrame: number
): Element[] {
  if (!keyframes || keyframes.length === 0) return [];

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  // 最初のキーフレーム以前
  if (currentFrame <= sorted[0].frame) {
    return sorted[0].elements.map((el) => ({ ...el }));
  }

  // 最後のキーフレーム以降
  if (currentFrame >= sorted[sorted.length - 1].frame) {
    return sorted[sorted.length - 1].elements.map((el) => ({ ...el }));
  }

  // 前後のキーフレームを探す
  let prev = sorted[0];
  let next = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (
      currentFrame >= sorted[i].frame &&
      currentFrame <= sorted[i + 1].frame
    ) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  // トゥイーンなし、または同一フレーム
  if (prev.tween === "none" || prev.frame === next.frame) {
    return prev.elements.map((el) => ({ ...el }));
  }

  const rawT =
    (currentFrame - prev.frame) / (next.frame - prev.frame);
  const t = applyEasing(rawT, prev.easing ?? "linear");

  // 同じ id の要素をマッチさせて補間
  const nextMap = new Map(next.elements.map((el) => [el.id, el]));
  const result: Element[] = [];

  for (const el of prev.elements) {
    const match = nextMap.get(el.id);
    if (match) {
      result.push(interpolateElement(el, match, t));
    } else {
      // 次のキーフレームに無い要素は前の状態を維持
      result.push({ ...el });
    }
  }

  // 次のキーフレームにだけある要素は、t が十分大きいときのみ追加（簡易）
  // ここでは prev にない要素は出さない（Flash的な振る舞い）

  return result;
}

/**
 * 後方互換用（非推奨）
 * 旧コードが Keyframe 全体を補間しようとしていた場合のフォールバック
 */
export function getInterpolatedFrame(
  keyframes: Keyframe[],
  currentFrame: number
): { frame: number; elements: Element[]; tween?: TweenType } | null {
  if (!keyframes || keyframes.length === 0) return null;

  const elements = getElementsAtFrame(keyframes, currentFrame);
  return {
    frame: currentFrame,
    elements,
  };
}
