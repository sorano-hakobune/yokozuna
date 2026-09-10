/**
 * テキスト図形の共有計測ロジック。
 *
 * - 横書き / 縦書き
 * - 複数行 (`\n` 区切り: 空行・先頭/末尾改行を含む)
 * - Canvas による実寸計測 (不可時は文字数フォールバック)
 * - ステージ上で編集可能な範囲に収まる上限
 *
 * TextEditOverlay / shapeFactory / Stage / LayerContent / transformGeometry /
 * renderFrameCanvas から共有し、入力欄と実テキストのサイズを一致させる。
 */

export type TextOrientationKind = "horizontal" | "vertical";

export interface TextMeasureOptions {
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

export const TEXT_MEASURE_MAX_WIDTH = 1600;
export const TEXT_MEASURE_MAX_HEIGHT = 1200;
const TEXT_MEASURE_MIN_LINE_WIDTH = 8;

let sharedCtx: CanvasRenderingContext2D | null | undefined;

function getSharedCtx(): CanvasRenderingContext2D | null {
  if (sharedCtx !== undefined) return sharedCtx;
  try {
    if (typeof document === "undefined") {
      sharedCtx = null;
      return sharedCtx;
    }
    const canvas = document.createElement("canvas");
    sharedCtx = canvas.getContext("2d");
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

function fontString(
  fontSize: number,
  opts?: TextMeasureOptions,
): string {
  const style = opts?.fontStyle ?? "normal";
  const weight = opts?.fontWeight ?? "normal";
  const family = opts?.fontFamily ?? "sans-serif";
  return `${style} ${weight} ${fontSize}px ${family}`;
}

/** `\r\n` を正規化して行分割。空行・先頭/末尾改行を保持する。 */
export function splitTextLines(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

function clampLineHeight(v: number | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.2;
  return Math.min(4, Math.max(0.5, n));
}

/** 1行の描画幅を計測 (letterSpacing を加味)。 */
export function measureLineWidth(
  line: string,
  fontSize: number,
  opts?: TextMeasureOptions,
): number {
  const chars = Array.from(line);
  const ls = Number(opts?.letterSpacing ?? 0) || 0;
  const extra = ls > 0 && chars.length > 1 ? (chars.length - 1) * ls : 0;
  if (chars.length === 0) return 0;
  const ctx = getSharedCtx();
  if (ctx) {
    try {
      ctx.font = fontString(fontSize, opts);
      const w = ctx.measureText(line).width;
      if (Number.isFinite(w) && w >= 0) return w + extra;
    } catch {
      // fall through to estimate
    }
  }
  // フォールバック: CJK(全角)を 1em、ASCII を 0.6em として概算
  let est = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      code > 0xff ||
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xff00 && code <= 0xffef);
    est += fontSize * (wide ? 1.0 : 0.6);
  }
  return est + extra;
}

/**
 * テキスト内容の自然なボックスサイズ (ステージ単位) を返す。
 * - 横書き: 幅=最長行の実測幅 / 高さ=行数×行送り
 * - 縦書き: 改行ごと新しい列。幅=列数×行送り / 高さ=最長列の文字数×全角相当
 */
export function measureTextBox(
  content: string,
  fontSize: number,
  orientation: TextOrientationKind,
  opts?: TextMeasureOptions,
): { width: number; height: number } {
  const fs = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
  const lh = clampLineHeight(opts?.lineHeight);
  const lines = splitTextLines(content);
  // "" は1行として扱う (キャレット用の最小ボックス)
  const lineCount = Math.max(1, lines.length);

  if (orientation === "vertical") {
    const columns = lineCount;
    let maxChars = 1;
    for (const line of lines) {
      maxChars = Math.max(maxChars, Math.max(1, Array.from(line).length));
    }
    // 縦書きは全角ベース: 1文字 ≈ fs (letterSpacing を加味)
    const ls = Number(opts?.letterSpacing ?? 0) || 0;
    const colH =
      maxChars * fs + (maxChars > 1 && ls > 0 ? (maxChars - 1) * ls : 0);
    const width = Math.min(
      TEXT_MEASURE_MAX_WIDTH,
      Math.max(fs * 1.0, columns * fs * lh + fs * 0.3),
    );
    const height = Math.min(
      TEXT_MEASURE_MAX_HEIGHT,
      Math.max(fs * lh, colH + fs * 0.2),
    );
    return { width, height };
  }

  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, measureLineWidth(line, fs, opts));
  }
  const width = Math.min(
    TEXT_MEASURE_MAX_WIDTH,
    Math.max(
      Math.max(fs * 0.6, TEXT_MEASURE_MIN_LINE_WIDTH),
      maxW + fs * 0.3,
    ),
  );
  const height = Math.min(
    TEXT_MEASURE_MAX_HEIGHT,
    Math.max(fs * lh, lineCount * fs * lh + fs * 0.15),
  );
  return { width, height };
}
