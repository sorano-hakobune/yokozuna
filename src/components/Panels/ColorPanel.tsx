import { useCallback, useEffect, useRef, useState } from "react";
import { Droplet, Pipette } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { toHex6 } from "@/lib/color";

/** 土俵四色房を先頭に置いたスウォッチ（東青・南朱・西白・北黒） */
const SWATCHES = [
  "#3d7eb8",
  "#e05a3c",
  "#e8eef2",
  "#141a1e",
  "#000000",
  "#ffffff",
  "#0066cc",
  "#ee3333",
  "#22aa88",
  "#7c3d2f",
  "#80929b",
  "#1b252b",
  "#4aa3c7",
  "#c45c26",
  "#d9e2e8",
  "#3949ab",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string) {
  const v = toHex6(hex, "#000000").slice(1);
  const n = parseInt(v, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** RGB 0–255 → HSV h 0–360, s/v 0–1 */
function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

const WHEEL_SIZE = 148;

export function ColorPanel() {
  const [mode, setMode] = useState<"fill" | "stroke">("fill");
  const [alpha, setAlpha] = useState(255);
  const drawingFill = useProjectStore((s) => s.drawingFill);
  const drawingStroke = useProjectStore((s) => s.drawingStroke);
  const drawingStrokeWidth = useProjectStore((s) => s.drawingStrokeWidth);
  const setDrawingFill = useProjectStore((s) => s.setDrawingFill);
  const setDrawingStroke = useProjectStore((s) => s.setDrawingStroke);
  const setDrawingStrokeWidth = useProjectStore((s) => s.setDrawingStrokeWidth);
  const selectedTool = useProjectStore((s) => s.selectedTool);
  const setSelectedTool = useProjectStore((s) => s.setSelectedTool);

  const color = mode === "fill" ? drawingFill : drawingStroke;
  const setColor = mode === "fill" ? setDrawingFill : setDrawingStroke;
  const rgb = hexToRgb(color);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  const wheelRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const paintWheel = useCallback(() => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = WHEEL_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;
    const image = ctx.createImageData(size, size);
    const data = image.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist > radius) {
          data[i + 3] = 0;
          continue;
        }
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        const sat = dist / radius;
        const { r, g, b } = hsvToRgb(angle, sat, 1);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  useEffect(() => {
    paintWheel();
  }, [paintWheel]);

  const pickFromWheel = (clientX: number, clientY: number) => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = WHEEL_SIZE / 2;
    const cy = WHEEL_SIZE / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = WHEEL_SIZE / 2 - 2;
    if (dist > radius + 4) return;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    const sat = clamp(dist / radius, 0, 1);
    const { r, g, b } = hsvToRgb(angle, sat, hsv.v <= 0.01 ? 1 : hsv.v);
    setColor(rgbToHex(r, g, b));
  };

  const setChannel = (channel: "r" | "g" | "b", value: number) => {
    setColor(
      rgbToHex(
        channel === "r" ? value : rgb.r,
        channel === "g" ? value : rgb.g,
        channel === "b" ? value : rgb.b,
      ),
    );
  };

  const setHsvChannel = (channel: "h" | "s" | "v", value: number) => {
    const next = {
      h: channel === "h" ? value : hsv.h,
      s: channel === "s" ? value / 100 : hsv.s,
      v: channel === "v" ? value / 100 : hsv.v,
    };
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
    setColor(rgbToHex(r, g, b));
  };

  const markerStyle = (() => {
    const radius = (WHEEL_SIZE / 2 - 2) * hsv.s;
    const rad = (hsv.h * Math.PI) / 180;
    const x = WHEEL_SIZE / 2 + Math.cos(rad) * radius;
    const y = WHEEL_SIZE / 2 + Math.sin(rad) * radius;
    return { left: x, top: y };
  })();

  return (
    <section className="panel-block color-panel-v2">
      <div className="panel-heading">
        <span>カラー</span>
      </div>
      <div className="panel-body color-mixer">
        <div className="color-tool-row">
          <button
            type="button"
            className={
              selectedTool === "paintbucket"
                ? "color-tool-btn is-active"
                : "color-tool-btn"
            }
            title="塗りつぶし (K)"
            onClick={() => setSelectedTool("paintbucket")}
          >
            <Droplet size={14} />
            <span>塗り</span>
          </button>
          <button
            type="button"
            className={
              selectedTool === "eyedropper"
                ? "color-tool-btn is-active"
                : "color-tool-btn"
            }
            title="スポイト (I)"
            onClick={() => setSelectedTool("eyedropper")}
          >
            <Pipette size={14} />
            <span>スポイト</span>
          </button>
        </div>

        <div className="color-mode">
          <button
            type="button"
            className={mode === "fill" ? "is-active" : ""}
            onClick={() => setMode("fill")}
          >
            塗り
          </button>
          <button
            type="button"
            className={mode === "stroke" ? "is-active" : ""}
            onClick={() => setMode("stroke")}
          >
            線
          </button>
        </div>

        <div className="color-wheel-wrap">
          <canvas
            ref={wheelRef}
            className="color-wheel"
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            onMouseDown={(e) => {
              dragging.current = true;
              pickFromWheel(e.clientX, e.clientY);
              const onMove = (ev: MouseEvent) => {
                if (!dragging.current) return;
                pickFromWheel(ev.clientX, ev.clientY);
              };
              const onUp = () => {
                dragging.current = false;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
          <span
            className="color-wheel-marker"
            style={{
              left: markerStyle.left,
              top: markerStyle.top,
              background: color,
            }}
          />
        </div>

        <label className="hsv-row">
          <span>明度</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            onChange={(e) => setHsvChannel("v", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            onChange={(e) => setHsvChannel("v", Number(e.target.value))}
          />
        </label>

        <div className="color-preview-row">
          <div className="color-preview" style={{ background: color }} />
          <input
            className="hex-input"
            value={toHex6(color, "#000000")}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v.toLowerCase());
            }}
            spellCheck={false}
          />
        </div>

        <div className="rgb-grid">
          <span>R</span>
          <input
            type="range"
            min={0}
            max={255}
            value={rgb.r}
            onChange={(e) => setChannel("r", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={255}
            value={rgb.r}
            onChange={(e) => setChannel("r", Number(e.target.value))}
          />
          <span>G</span>
          <input
            type="range"
            min={0}
            max={255}
            value={rgb.g}
            onChange={(e) => setChannel("g", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={255}
            value={rgb.g}
            onChange={(e) => setChannel("g", Number(e.target.value))}
          />
          <span>B</span>
          <input
            type="range"
            min={0}
            max={255}
            value={rgb.b}
            onChange={(e) => setChannel("b", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={255}
            value={rgb.b}
            onChange={(e) => setChannel("b", Number(e.target.value))}
          />
          <span>A</span>
          <input
            type="range"
            min={0}
            max={255}
            value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={255}
            value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
          />
        </div>

        <div className="swatch-row">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="swatch"
              style={{ background: swatch }}
              title={swatch}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>

        <label className="stroke-row">
          線幅
          <input
            type="number"
            min={1}
            max={100}
            value={drawingStrokeWidth}
            onChange={(e) => setDrawingStrokeWidth(Number(e.target.value))}
          />
        </label>
      </div>
    </section>
  );
}
