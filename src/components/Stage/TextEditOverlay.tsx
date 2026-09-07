import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ShapeElement } from "@/types/project";

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
  const sy = Math.abs(session.scaleY) || 1;
  const fontSizePx = Math.max(6, session.fontSize * zoom * sx);
  const boxW = Math.max(
    fontSizePx * (vertical ? 1.2 : 2),
    (session.width || fontSizePx * 2) * zoom * sx,
  );
  const boxH = Math.max(
    fontSizePx * 1.2,
    (session.height || fontSizePx * 1.4) * zoom * sy,
  );

  const style: CSSProperties = {
    position: "fixed",
    left: screen.x,
    top: screen.y,
    transform: `translate(-50%, -50%) rotate(${session.rotation}deg)`,
    transformOrigin: "center center",
    width: vertical ? Math.max(boxW, fontSizePx * 1.5) : Math.max(boxW, fontSizePx * 3),
    height: vertical ? Math.max(boxH, fontSizePx * 3) : Math.max(boxH, fontSizePx * 1.5),
    fontSize: fontSizePx,
    fontFamily: session.fontFamily || "sans-serif",
    color: session.fill || "#e8eef2",
    opacity: session.opacity ?? 1,
    lineHeight: 1.2,
    writingMode: vertical ? "vertical-rl" : "horizontal-tb",
    textOrientation: vertical ? "upright" : undefined,
    resize: "none",
    zIndex: 9000,
    margin: 0,
    padding: "1px 2px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "transparent",
    border: "1px solid var(--yo-accent, #e05a3c)",
    outline: "none",
    boxShadow: "0 0 0 1px rgba(224, 90, 60, 0.35)",
    caretColor: session.fill || "#e05a3c",
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // IME: don't commit while composing
    if (e.nativeEvent.isComposing || e.key === "Process") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish("commit");
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
  };
}

export function measureTextBox(
  content: string,
  fontSize: number,
  orientation: "horizontal" | "vertical",
): { width: number; height: number } {
  const t = content || " ";
  if (orientation === "vertical") {
    return {
      width: fontSize * 1.4,
      height: Math.max(fontSize, Math.max(1, t.length) * fontSize * 1.1),
    };
  }
  return {
    width: Math.max(fontSize, Math.max(1, t.length) * fontSize * 0.6),
    height: fontSize * 1.4,
  };
}
