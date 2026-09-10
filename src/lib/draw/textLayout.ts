/**
 * ステージ上のテキスト描画 (LayerContent) と選択境界 (transformGeometry /
 * stageGeometry のヒットテスト) で共有するレイアウト計算。
 *
 * 背景: SVG `writing-mode: vertical-rl` + `text-anchor: start` の場合、
 * ブラウザは列原点 `x` を列中央ではなく右端基準に配置する (headless Chrome
 * の getBBox による実測)。前回修正は `x` = 列中央と仮定した式で描画だけを
 * 変更し、選択境界は別式のままだったため、縦書きでグリフが選択ボックスの
 * 左にはみ出すズレが発生した。本モジュールに位置・境界の計算を一元化し、
 * 描画と選択が同じ値を使うことでズレを構造的に防ぐ。
 *
 * 実測値 (sans-serif / CJK、headless Chrome getBBox):
 * - 縦書き列インク: [x - 1.225em, x + 0.233em]、縦送りは正確に 1em/字
 * - 横書き行インク: X は canvas advance 通り、Y は baseline 上 0.92em / 下 0.60em
 * フォント差による数 px の誤差は残るが、従来の横書き許容範囲と同程度。
 */

export const VERTICAL_COL_LEFT_OVERHANG = 1.225;
export const VERTICAL_COL_RIGHT_OVERHANG = 0.233;
export const HORIZONTAL_TOP_OVERHANG = 0.92;
export const HORIZONTAL_BOTTOM_OVERHANG = 0.6;

export type TextAlignKind = "left" | "center" | "right";

/** Inspector/保存値と同じクランプ (0.5〜4、既定 1.2)。 */
export function clampLineHeightFactor(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0.5 || n > 4) return 1.2;
  return n;
}

/** `\r\n` を正規化して行分割。空行・先頭/末尾改行を保持する。 */
export function splitContentLines(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

/** 各列の文字数の最大値 (縦書きの列高さ用。空列は 1 として扱う)。 */
export function maxCharsPerLine(lines: string[]): number {
  let max = 1;
  for (const line of lines) {
    const len = Array.from(line).length;
    if (len > max) max = len;
  }
  return max;
}

/**
 * 縦書き i 列目の原点 x (右端基準のスロット配置)。
 * 描画 `<text x>` と選択境界の両方で使う。値は従来通り。
 */
export function verticalColumnX(
  boxW: number,
  linePitch: number,
  index: number,
): number {
  return boxW / 2 - linePitch / 2 - index * linePitch;
}

/**
 * 縦書きのインク境界 (選択ボックス・ヒットテスト用)。
 * Y は従来通り正確 (上端 -boxH/2 から 1em/字)。X は実測の非対称
 * オーバーハングで補正し、描画グリフを包含する。
 */
export function verticalInkBounds(
  boxW: number,
  boxH: number,
  fontSize: number,
  linePitch: number,
  lineCount: number,
  maxChars: number,
  letterSpacing = 0,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const firstX = verticalColumnX(boxW, linePitch, 0);
  const lastX = verticalColumnX(boxW, linePitch, Math.max(0, lineCount - 1));
  const ls = Number(letterSpacing) || 0;
  const colH =
    Math.max(maxChars, 1) * fontSize +
    (maxChars > 1 && ls > 0 ? (maxChars - 1) * ls : 0);
  return {
    minX: lastX - VERTICAL_COL_LEFT_OVERHANG * fontSize,
    maxX: firstX + VERTICAL_COL_RIGHT_OVERHANG * fontSize,
    minY: -boxH / 2,
    maxY: -boxH / 2 + Math.max(colH, fontSize),
  };
}

/** 横書きのアンカー X (textAlign 対応)。描画と選択で共有。値は従来通り。 */
export function horizontalAnchorX(
  boxW: number,
  textAlign: TextAlignKind | string | undefined,
): number {
  if (textAlign === "center") return 0;
  if (textAlign === "right") return boxW / 2;
  return -boxW / 2;
}

/** 横書きの先頭行ベースライン Y (ブロック中央配置)。値は従来通り。 */
export function horizontalFirstBaselineY(
  lineCount: number,
  linePitch: number,
): number {
  return (-(Math.max(1, lineCount) - 1) * linePitch) / 2;
}

/**
 * 横書きのインク境界。X は実測 advance 通り (従来通り正確)。
 * Y は実測の非対称 (上 0.92em / 下 0.60em) で包含する。
 */
export function horizontalInkBounds(
  boxW: number,
  fontSize: number,
  linePitch: number,
  lineCount: number,
  textWidth: number,
  textAlign: TextAlignKind | string | undefined,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const firstY = horizontalFirstBaselineY(lineCount, linePitch);
  const lastY = firstY + (Math.max(1, lineCount) - 1) * linePitch;
  let minX: number;
  let maxX: number;
  if (textAlign === "center") {
    minX = -textWidth / 2;
    maxX = textWidth / 2;
  } else if (textAlign === "right") {
    maxX = boxW / 2;
    minX = maxX - textWidth;
  } else {
    minX = -boxW / 2;
    maxX = minX + textWidth;
  }
  return {
    minX,
    maxX,
    minY: firstY - HORIZONTAL_TOP_OVERHANG * fontSize,
    maxY: lastY + HORIZONTAL_BOTTOM_OVERHANG * fontSize,
  };
}
