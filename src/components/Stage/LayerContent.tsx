import React from "react";
import type {
  Element,
  Layer,
  Project,
  ShapeElement,
} from "@/types/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { shapeToPathD } from "@/lib/draw/pathBezier";
import { SvgFilterDefs, elementFilterId } from "@/lib/filters";
import { svgGradientDef } from "@/lib/draw/gradient";

const elementTransform = (shape: ShapeElement) =>
  `translate(${shape.x} ${shape.y}) rotate(${shape.rotation ?? 0}) scale(${shape.scaleX ?? 1} ${shape.scaleY ?? 1})`;

type ShapeMode = "normal" | "mask" | "guide" | "mask-overlay";


function ShapeGradientDefs({ shape }: { shape: ShapeElement }) {
  const g = shape.fillGradient;
  if (!g?.stops?.length) return null;
  const id = `grad-${shape.id}`;
  const def = svgGradientDef(id, g);
  const stops = def.stops.map((s, i) => (
    <stop
      key={i}
      offset={`${Math.max(0, Math.min(1, s.offset)) * 100}%`}
      stopColor={s.color || "#000"}
    />
  ));
  if (def.tag === "linearGradient") {
    return (
      <defs>
        <linearGradient {...def.attrs}>{stops}</linearGradient>
      </defs>
    );
  }
  return (
    <defs>
      <radialGradient {...def.attrs}>{stops}</radialGradient>
    </defs>
  );
}

const VectorShape: React.FC<{
  shape: ShapeElement;
  mode?: ShapeMode;
}> = ({ shape, mode = "normal" }) => {
  const isMask = mode === "mask";
  const isGuide = mode === "guide";
  const isOverlay = mode === "mask-overlay";

  const gradientId =
    !isMask &&
    !isGuide &&
    !isOverlay &&
    shape.fillGradient &&
    shape.fillGradient.stops?.length
      ? `grad-${shape.id}`
      : null;
  const fill = isMask
    ? "#ffffff"
    : isGuide
      ? "none"
      : isOverlay
        ? "rgba(74, 144, 226, 0.35)"
        : gradientId
          ? `url(#${gradientId})`
          : (shape.fill ?? "none");
  const stroke = isMask
    ? "none"
    : isGuide
      ? "#22d3ee"
      : isOverlay
        ? "#3b82f6"
        : (shape.stroke ?? "none");
  const strokeWidth = isGuide
    ? Math.max(1.5, shape.strokeWidth ?? 1)
    : isOverlay
      ? 1
      : (shape.strokeWidth ?? 1);

  const common = {
    fill,
    stroke,
    strokeWidth,
    strokeDasharray: isGuide ? "4 3" : undefined,
    vectorEffect: "non-scaling-stroke" as const,
    transform: elementTransform(shape),
  };

  let body: React.ReactNode = null;
  switch (shape.shapeType) {
    case "rectangle": {
      const rw = shape.width ?? 100;
      const rh = shape.height ?? 100;
      const rr = Math.max(0, Math.min(shape.cornerRadius ?? 0, Math.min(rw, rh) / 2));
      body = (
        <rect
          {...common}
          x={-rw / 2}
          y={-rh / 2}
          width={rw}
          height={rh}
          rx={rr}
          ry={rr}
        />
      );
      break;
    }
    case "circle":
      body = <circle {...common} cx={0} cy={0} r={shape.radius ?? 50} />;
      break;
    case "text": {
      const content = shape.text ?? "";
      const fontSize = shape.fontSize ?? 24;
      const vertical = shape.textOrientation === "vertical";
      const w = shape.width ?? (vertical ? fontSize * 1.4 : Math.max(40, content.length * fontSize * 0.6));
      const h = shape.height ?? (vertical ? Math.max(fontSize, content.length * fontSize * 1.1) : fontSize * 1.4);
      const textFill = isMask
        ? "#ffffff"
        : isGuide
          ? "#22d3ee"
          : isOverlay
            ? "rgba(74, 144, 226, 0.85)"
            : gradientId
              ? `url(#${gradientId})`
              : (shape.fill ?? "#e8eef2");
      const writingMode = vertical ? "vertical-rl" : "horizontal-tb";
      const textAnchor =
        shape.textAlign === "center"
          ? "middle"
          : shape.textAlign === "right"
            ? "end"
            : "start";
      const x =
        textAnchor === "middle"
          ? 0
          : textAnchor === "end"
            ? w / 2
            : -w / 2;
      const y = vertical ? -h / 2 : fontSize * 0.35;
      body = (
        <g transform={elementTransform(shape)}>
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill={isMask ? "#ffffff" : "transparent"}
            stroke={isGuide ? "#22d3ee" : "none"}
            strokeDasharray={isGuide ? "4 3" : undefined}
            pointerEvents="none"
          />
          <text
            x={x}
            y={y}
            fill={textFill}
            fontFamily={shape.fontFamily ?? "sans-serif"}
            fontSize={fontSize}
            fontWeight={shape.fontWeight ?? "normal"}
            fontStyle={shape.fontStyle ?? "normal"}
            letterSpacing={shape.letterSpacing ?? 0}
            textAnchor={textAnchor}
            dominantBaseline={vertical ? "hanging" : "middle"}
            style={{
              writingMode: writingMode as React.CSSProperties["writingMode"],
              userSelect: "none",
            }}
            opacity={isGuide ? 0.85 : 1}
          >
            {content}
          </text>
        </g>
      );
      break;
    }
    case "line":
    case "path": {
      const points = shape.points ?? [];
      if (points.length < 2) {
        body = null;
        break;
      }
      const d = shapeToPathD(shape);
      body = (
        <path
          {...common}
          d={d}
          fillRule={shape.fillRule}
          fill={shape.shapeType === "line" ? "none" : common.fill}
        />
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <>
      {gradientId ? <ShapeGradientDefs shape={shape} /> : null}
      {body}
    </>
  );
};

function renderElement(
  element: Element,
  project: Project,
  currentFrame: number,
  mode: ShapeMode,
  keyPrefix: string,
): React.ReactNode {
  if (element.type === "shape") {
    const fid =
      element.filters?.length && mode === "normal"
        ? elementFilterId(`${keyPrefix}-${element.id}`)
        : null;
    return (
      <g
        key={`${keyPrefix}-${element.id}`}
        opacity={mode === "mask" ? 1 : (element.opacity ?? 1)}
        filter={fid ? `url(#${fid})` : undefined}
      >
        {fid && element.filters ? (
          <SvgFilterDefs filterId={fid} filters={element.filters} />
        ) : null}
        <VectorShape shape={element as ShapeElement} mode={mode} />
      </g>
    );
  }

  if (element.type === "instance") {
    if (mode === "mask" || mode === "guide") {
      // Approximate instance bounds as a rect for mask/guide
      const symbol = project.symbols[element.symbolId];
      const w = symbol?.width ?? 100;
      const h = symbol?.height ?? 100;
      return (
        <g
          key={`${keyPrefix}-${element.id}`}
          transform={`translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0}) scale(${element.scaleX ?? 1} ${element.scaleY ?? 1})`}
          opacity={mode === "guide" ? 0.5 : 1}
        >
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill={mode === "mask" ? "#ffffff" : "none"}
            stroke={mode === "guide" ? "#22d3ee" : "none"}
            strokeWidth={1.5}
            strokeDasharray={mode === "guide" ? "4 3" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      );
    }
    const symbol = project.symbols[element.symbolId];
    if (!symbol) return null;
    const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0}) scale(${element.scaleX ?? 1} ${element.scaleY ?? 1})`;
    const symFrame =
      symbol.type === "graphic"
        ? Math.min(currentFrame, Math.max(0, symbol.duration - 1))
        : 0;
    const fid = element.filters?.length
      ? elementFilterId(`${keyPrefix}-${element.id}`)
      : null;
    return (
      <g
        key={`${keyPrefix}-${element.id}`}
        opacity={element.opacity ?? 1}
        transform={transform}
        filter={fid ? `url(#${fid})` : undefined}
      >
        {fid && element.filters ? (
          <SvgFilterDefs filterId={fid} filters={element.filters} />
        ) : null}
        <line
          x1={-6}
          y1={0}
          x2={6}
          y2={0}
          stroke="#94a3b8"
          strokeWidth={1}
          opacity={0.35}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          y1={-6}
          x2={0}
          y2={6}
          stroke="#94a3b8"
          strokeWidth={1}
          opacity={0.35}
          vectorEffect="non-scaling-stroke"
        />
        {[...symbol.layers].reverse().map((symLayer) => {
          if (!symLayer.visible) return null;
          return getElementsAtFrame(symLayer.keyframes, symFrame).map(
            (child) => renderElement(child, project, symFrame, "normal", element.id),
          );
        })}
      </g>
    );
  }

  if (element.type === "bitmap") {
    const asset = project.assets[element.assetId];
    if (!asset?.src || !asset.width || !asset.height) return null;
    const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation}) scale(${element.scaleX} ${element.scaleY})`;
    if (mode === "mask") {
      return (
        <g key={`${keyPrefix}-${element.id}`} transform={transform}>
          <rect
            x={-asset.width / 2}
            y={-asset.height / 2}
            width={asset.width}
            height={asset.height}
            fill="#ffffff"
          />
        </g>
      );
    }
    const fid =
      element.filters?.length && mode === "normal"
        ? elementFilterId(`${keyPrefix}-${element.id}`)
        : null;
    return (
      <g
        key={`${keyPrefix}-${element.id}`}
        opacity={mode === "guide" ? 0.35 : element.opacity}
        transform={transform}
        filter={fid ? `url(#${fid})` : undefined}
      >
        {fid && element.filters ? (
          <SvgFilterDefs filterId={fid} filters={element.filters} />
        ) : null}
        <image
          href={asset.src}
          x={-asset.width / 2}
          y={-asset.height / 2}
          width={asset.width}
          height={asset.height}
          preserveAspectRatio="none"
        />
        {mode === "guide" && (
          <rect
            x={-asset.width / 2}
            y={-asset.height / 2}
            width={asset.width}
            height={asset.height}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    );
  }

  return null;
}

export function renderLayerElements(
  layer: Layer,
  project: Project,
  currentFrame: number,
  mode: ShapeMode = "normal",
): React.ReactNode[] {
  if (!layer.visible) return [];
  return getElementsAtFrame(layer.keyframes, currentFrame).map((el) =>
    renderElement(el, project, currentFrame, mode, layer.id),
  );
}

export { VectorShape };
