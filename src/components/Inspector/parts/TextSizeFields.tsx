import { useEffect, useState } from "react";
import type { InspectorModel } from "../hooks/useInspectorModel";
import { getSystemFonts } from "../../../lib/systemFonts";

export function TextFields({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (el?.type !== "shape" || el.shapeType !== "text") return null;
  const on = m.handleElementPropertyChange;

  const [fonts, setFonts] = useState<string[]>(() => [
    "sans-serif",
    "serif",
    "monospace",
    "Yu Gothic",
    "Yu Mincho",
    "Hiragino Sans",
    "Noto Sans JP",
    "Meiryo",
  ]);

  useEffect(() => {
    let cancelled = false;
    getSystemFonts().then((list) => {
      if (!cancelled && list.length > 0) setFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = el.fontFamily ?? "sans-serif";
  // Ensure the current value is always present in the datalist even if not in system list
  const options = fonts.includes(current) ? fonts : [current, ...fonts];

  return (
    <>
      <label className="prop-field">
        <span>内容</span>
        <input
          type="text"
          value={el.text ?? ""}
          onChange={(e) => on("text", e.target.value)}
        />
      </label>
      <label className="prop-field">
        <span>向き</span>
        <select
          value={el.textOrientation ?? "horizontal"}
          onChange={(e) => on("textOrientation", e.target.value)}
        >
          <option value="horizontal">横書き</option>
          <option value="vertical">縦書き</option>
        </select>
      </label>
      <label className="prop-field">
        <span>フォント</span>
        <input
          type="text"
          list="yoko-system-fonts"
          value={current}
          onChange={(e) => on("fontFamily", e.target.value)}
          placeholder="フォント名"
          spellCheck={false}
          autoComplete="off"
        />
        <datalist id="yoko-system-fonts">
          {options.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <label className="prop-field">
        <span>サイズ</span>
        <input
          type="number"
          min={6}
          max={256}
          value={el.fontSize ?? 24}
          onChange={(e) => on("fontSize", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>太さ</span>
        <select
          value={String(el.fontWeight ?? "normal")}
          onChange={(e) => on("fontWeight", e.target.value)}
        >
          <option value="normal">標準</option>
          <option value="bold">太字</option>
          <option value="300">Light</option>
          <option value="600">Semi</option>
        </select>
      </label>
      <label className="prop-field">
        <span>斜体</span>
        <select
          value={el.fontStyle ?? "normal"}
          onChange={(e) => on("fontStyle", e.target.value)}
        >
          <option value="normal">なし</option>
          <option value="italic">斜体</option>
        </select>
      </label>
      <label className="prop-field">
        <span>整列</span>
        <select
          value={el.textAlign ?? "left"}
          onChange={(e) => on("textAlign", e.target.value)}
        >
          <option value="left">左</option>
          <option value="center">中央</option>
          <option value="right">右</option>
        </select>
      </label>
      <label className="prop-field">
        <span>行間</span>
        <input
          type="number"
          min={0.5}
          max={4}
          step={0.1}
          value={el.lineHeight ?? 1.2}
          onChange={(e) => on("lineHeight", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>字間</span>
        <input
          type="number"
          min={-10}
          max={50}
          step={0.5}
          value={el.letterSpacing ?? 0}
          onChange={(e) => on("letterSpacing", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>色</span>
        <input
          type="color"
          value={el.fill ?? "#e8eef2"}
          onChange={(e) => on("fill", e.target.value)}
        />
      </label>
    </>
  );
}

export function SizeFields({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (el?.type !== "shape") return null;
  const on = m.handleElementPropertyChange;
  if (el.shapeType === "rectangle") {
    return (
      <>
        <label className="prop-field">
          <span>幅</span>
          <input
            type="number"
            value={el.width ?? 100}
            onChange={(e) => on("width", Number(e.target.value))}
          />
        </label>
        <label className="prop-field">
          <span>高さ</span>
          <input
            type="number"
            value={el.height ?? 100}
            onChange={(e) => on("height", Number(e.target.value))}
          />
        </label>
        <label className="prop-field">
          <span>角丸</span>
          <input
            type="number"
            min={0}
            value={(el as { cornerRadius?: number }).cornerRadius ?? 0}
            onChange={(e) =>
              on("cornerRadius", Math.max(0, Number(e.target.value)))
            }
          />
        </label>
      </>
    );
  }
  if (el.shapeType === "circle") {
    return (
      <label className="prop-field">
        <span>半径</span>
        <input
          type="number"
          value={el.radius ?? 50}
          onChange={(e) => on("radius", Number(e.target.value))}
        />
      </label>
    );
  }
  return null;
}
