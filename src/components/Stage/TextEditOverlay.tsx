import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ShapeElement } from "@/types/project";
import {
  measureTextBox as measureSharedTextBox,
  type TextMeasureOptions,
} from "@/lib/draw/textMeasure";

export type TextEditSession = {
  /** null = creating a new text shape */
  elementId: string | null;
  layerId: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  textOrientation: "horizontal" | "vertical";
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
};

type Props = {
  session: TextEditSession;
  /** Root stage <svg> — used for accurate screen mapping via CTM */
  svgElement: SVGSVGElement | null;
  canvasPan: { x: number; y: number };
  zoom: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
};

/**
 * Map stage (canvas) coordinates to viewport pixels using the SVG CTM.
 * Shape positions live inside <g transform="translate(pan)">, so we add pan.
 */
export function stagePointToScreen(
  svg: SVGSVGElement | null,
  stageX: number,
  stageY: number,
  pan: { x: number; y: number },
): { x: number; y: number } {
  if (!svg) return { x: 0, y: 0 };
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    const rect = svg.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }
  try {
    const pt = svg.createSVGPoint();
    pt.x = stageX + pan.x;
    pt.y = stageY + pan.y;
    const sp = pt.matrixTransform(ctm);
    return { x: sp.x, y: sp.y };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function TextEditOverlay({
  session,
  svgElement,
  canvasPan,
  zoom,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(session.text);
  const committedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const finish = (mode: "commit" | "cancel") => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (mode === "commit") onCommit(valueRef.current);
    else onCancel();
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Place caret at end for new text; select all when editing existing
    if (session.elementId && session.text) {
      el.select();
    } else {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [session.elementId, session.text]);

  // Document-level Escape (capture) so stage shortcuts don't steal it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish("cancel");
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const screen = stagePointToScreen(
    svgElement,
    session.x,
    session.y,
    canvasPan,
  );
  const vertical = session.textOrientation === "vertical";
  const sx = Math.abs(session.scaleX) || 1;
  const fontSizePx = Math.max(6, session.fontSize * zoom * sx);
  const lineHeightFactor =
    Number.isFinite(Number(session.lineHeight)) &&
    Number(session.lineHeight) >= 0.5 &&
    Number(session.lineHeight) <= 4
      ? Number(session.lineHeight)
      : 1.2;
  const fontFamily = session.fontFamily || "sans-serif";

  const style: CSSProperties = {
    position: "fixed",
    left: screen.x,
    top: screen.y,
    transform: `translate(-50%, -50%) rotate(${session.rotation}deg)`,
    transformOrigin: "center center",
    // 実サイズは下の自動伸縮 effect が DOM に直接設定する。
    // ここでは最小サイズだけ保証し、固定 width/height は持たせない。
    minWidth: Math.max(24, fontSizePx * 1.2),
    minHeight: Math.max(24, fontSizePx * lineHeightFactor),
    maxWidth: "75vw",
    maxHeight: "65vh",
    fontSize: fontSizePx,
    fontFamily,
    fontWeight: session.fontWeight ?? "normal",
    fontStyle: (session.fontStyle as CSSProperties["fontStyle"]) ?? "normal",
    letterSpacing: Number(session.letterSpacing ?? 0) || 0,
    textAlign: session.textAlign ?? "left",
    color: session.fill || "#e8eef2",
    opacity: session.opacity ?? 1,
    lineHeight: lineHeightFactor,
    writingMode: vertical ? "vertical-rl" : "horizontal-tb",
    textOrientation: vertical ? "upright" : undefined,
    resize: "none",
    zIndex: 9000,
    margin: 0,
    padding: "1px 2px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "break-word",
    background: "transparent",
    border: "1px solid var(--yo-accent, #e05a3c)",
    outline: "none",
    boxShadow: "0 0 0 1px rgba(224, 90, 60, 0.35)",
    caretColor: session.fill || "#e05a3c",
  };

  /**
   * 入力内容に応じた自動伸縮。
   * scrollWidth/scrollHeight を直接 DOM に反映するだけで React state を
   * 更新しないため、サイズ変更→再レンダリング→サイズ変更のループにならない。
   * 新規・既存編集のどちらもマウント時に1回走るため、編集開始時から正しい
   * サイズになる。フォント・ズーム・向きの変化にも追従する。
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // いったん auto に戻して内容の自然な寸法を測る (縮小対応に必須)
    el.style.width = "auto";
    el.style.height = "auto";
    el.style.overflowX = "hidden";
    el.style.overflowY = "hidden";
    const maxW = Math.min(
      1000,
      Math.max(160, Math.floor(window.innerWidth * 0.75)),
    );
    const maxH = Math.min(
      700,
      Math.max(120, Math.floor(window.innerHeight * 0.65)),
    );
    const minW = Math.max(24, Math.ceil(fontSizePx * 1.2));
    const minH = Math.max(24, Math.ceil(fontSizePx * lineHeightFactor));
    const needW = Math.ceil(el.scrollWidth) + 2;
    const needH = Math.ceil(el.scrollHeight) + 2;
    const nextW = Math.min(Math.max(needW, minW), maxW);
    const nextH = Math.min(Math.max(needH, minH), maxH);
    el.style.width = `${nextW}px`;
    el.style.height = `${nextH}px`;
    el.style.overflowX = needW > maxW ? "auto" : "hidden";
    el.style.overflowY = needH > maxH ? "auto" : "hidden";
  }, [value, fontSizePx, lineHeightFactor, vertical, fontFamily, session.letterSpacing, session.fontWeight, session.fontStyle, session.textAlign, zoom]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // IME: don't commit while composing
    if (e.nativeEvent.isComposing || e.key === "Process") return;
    // 既存仕様: Enter=確定 / Shift+Enter=改行 (IME確定の Enter は上で除外済み)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish("commit");
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish("cancel");
    }
  };

  return (
    <textarea
      ref={ref}
      className="yo-text-edit-overlay"
      style={style}
      value={value}
      spellCheck={false}
      rows={1}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish("commit")}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder=""
      aria-label="テキストを編集"
    />
  );
}

export function sessionFromShape(
  shape: ShapeElement,
  layerId: string,
): TextEditSession {
  return {
    elementId: shape.id,
    layerId,
    x: shape.x,
    y: shape.y,
    text: shape.text ?? "",
    fontSize: shape.fontSize ?? 24,
    fontFamily: shape.fontFamily ?? "sans-serif",
    fill: shape.fill ?? "#e8eef2",
    textOrientation:
      shape.textOrientation === "vertical" ? "vertical" : "horizontal",
    width: shape.width ?? 40,
    height: shape.height ?? 30,
    rotation: shape.rotation ?? 0,
    scaleX: shape.scaleX ?? 1,
    scaleY: shape.scaleY ?? 1,
    opacity: shape.opacity,
    fontWeight: shape.fontWeight ?? "normal",
    fontStyle: shape.fontStyle ?? "normal",
    letterSpacing: shape.letterSpacing ?? 0,
    lineHeight: shape.lineHeight ?? 1.2,
    textAlign: shape.textAlign ?? "left",
  };
}

export function measureTextBox(
  content: string,
  fontSize: number,
  orientation: "horizontal" | "vertical",
  opts?: TextMeasureOptions,
): { width: number; height: number } {
  return measureSharedTextBox(content, fontSize, orientation, opts);
}
