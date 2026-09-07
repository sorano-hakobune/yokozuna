import type { ElementFilter } from "@/types/project";
import {
  filtersToSvgPrimitives,
  type SvgFilterPrimitive,
} from "./elementFilters";

type Props = {
  filterId: string;
  filters: ElementFilter[];
};

function Primitive({ p }: { p: SvgFilterPrimitive }) {
  switch (p.kind) {
    case "blur":
      return (
        <feGaussianBlur
          in={p.in}
          stdDeviation={p.stdDeviation}
          result={p.result}
        />
      );
    case "offset":
      return (
        <feOffset in={p.in} dx={p.dx} dy={p.dy} result={p.result} />
      );
    case "flood":
      return (
        <feFlood
          floodColor={p.color}
          floodOpacity={p.opacity}
          result={p.result}
        />
      );
    case "composite":
      return (
        <feComposite
          in={p.in}
          in2={p.in2}
          operator={p.operator as "in"}
          result={p.result}
        />
      );
    case "merge":
      return (
        <feMerge result={p.result}>
          {p.nodes.map((n) => (
            <feMergeNode key={n} in={n} />
          ))}
        </feMerge>
      );
    case "colorMatrix":
      return (
        <feColorMatrix
          in={p.in}
          type="matrix"
          values={p.values}
          result={p.result}
        />
      );
    case "componentTransfer":
      return (
        <feComponentTransfer in={p.in} result={p.result}>
          <feFuncR type="linear" slope={p.slope} intercept={p.intercept} />
          <feFuncG type="linear" slope={p.slope} intercept={p.intercept} />
          <feFuncB type="linear" slope={p.slope} intercept={p.intercept} />
        </feComponentTransfer>
      );
    default:
      return null;
  }
}

/**
 * SVG filter definition for an element. Place inside a parent <g> (or <defs>).
 */
export function SvgFilterDefs({ filterId, filters }: Props) {
  if (!filters.length) return null;
  const { primitives } = filtersToSvgPrimitives(filters);
  if (!primitives.length) return null;
  return (
    <defs>
      <filter
        id={filterId}
        x="-50%"
        y="-50%"
        width="200%"
        height="200%"
        colorInterpolationFilters="sRGB"
      >
        {primitives.map((p, i) => (
          <Primitive key={`${p.result}-${i}`} p={p} />
        ))}
      </filter>
    </defs>
  );
}

export function elementFilterId(elementId: string): string {
  // SVG ids must be unique; strip unsafe chars
  return `ef-${elementId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
