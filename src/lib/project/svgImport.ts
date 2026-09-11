import type { ShapeElement } from "@/types/project";
import { generateId } from "./generateId";

export type SvgImportShape = Omit<
  ShapeElement,
  "id" | "x" | "y" | "scaleX" | "scaleY" | "rotation" | "opacity"
> & {
  /** Local-space geometry; caller places with x/y. */
  localX: number;
  localY: number;
  /** Effective opacity (inherited product, after opacity/fill-opacity folding). */
  opacity: number;
};

export type SvgImportResult = {
  width: number;
  height: number;
  viewBox: { x: number; y: number; width: number; height: number };
  shapes: SvgImportShape[];
  /** True when at least one vector primitive was parsed. */
  hasVectors: boolean;
};

type Pt = { x: number; y: number };

/**
 * Fallback used only when an element (and its ancestors / stylesheets)
 * specify no fill at all. This is the SVG initial value for `fill`
 * (black), NOT an arbitrary editor color. Parse failures must never be
 * masked with a decorative color — they resolve to `undefined` (none)
 * with a console warning instead.
 */
const SPEC_FILL_INITIAL = "#000000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: string | null | undefined, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function styleMap(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const style = attr(el, "style");
  if (style) {
    for (const part of style.split(";")) {
      const [k, ...rest] = part.split(":");
      if (!k || rest.length === 0) continue;
      out[k.trim().toLowerCase()] = rest.join(":").trim();
    }
  }
  return out;
}

function stripImportant(v: string): string {
  return v.replace(/\s*!important\s*$/i, "").trim();
}

function parseInlineStyle(el: Element): Record<string, string> {
  // Reuses styleMap but strips `!important` for reliable comparisons.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(styleMap(el))) {
    out[k] = stripImportant(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stylesheet (<style> + class) support (import-scoped subset)
// ---------------------------------------------------------------------------

type StyleRule = {
  selectors: string[];
  decls: Record<string, string>;
  order: number;
};

/** Collect `<style>` text rules in document order (import-scoped subset). */
function collectStyleRules(doc: Document): StyleRule[] {
  const rules: StyleRule[] = [];
  const styles = doc.getElementsByTagName("style");
  for (let s = 0; s < styles.length; s++) {
    const css = (styles[s]?.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = css.split("}");
    for (const block of blocks) {
      const brace = block.indexOf("{");
      if (brace < 0) continue;
      const selectorPart = block.slice(0, brace).trim();
      const declPart = block.slice(brace + 1).trim();
      if (!selectorPart || !declPart) continue;
      const selectors = selectorPart
        .split(",")
        .map((sel) => sel.trim().toLowerCase())
        .filter(Boolean);
      if (!selectors.length) continue;
      const decls: Record<string, string> = {};
      for (const decl of declPart.split(";")) {
        const colon = decl.indexOf(":");
        if (colon < 0) continue;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        const val = stripImportant(decl.slice(colon + 1));
        if (prop && val) decls[prop] = val;
      }
      if (Object.keys(decls).length) {
        rules.push({ selectors, decls, order: rules.length });
      }
    }
  }
  return rules;
}

function selectorSpecificity(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const classes = (sel.match(/\.[\w-]+/g) ?? []).length;
  const rest = sel
    .replace(/#[\w-]+/g, "")
    .replace(/\.[\w-]+/g, "")
    .trim();
  const elements = rest && rest !== "*" ? 1 : 0;
  return ids * 100 + classes * 10 + elements;
}

/**
 * Match a single compound selector without combinators:
 * `*`, `tag`, `.cls`, `#id`, `tag.cls`, `.a.b`, `tag#id.cls`, ...
 * Selectors with combinators / pseudo-classes / attribute filters are
 * intentionally unsupported and never match (instead of matching wrongly).
 */
function matchesSimpleSelector(el: Element, sel: string): boolean {
  if (!sel || /[\s>+~:[\]]/.test(sel)) return false;
  const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
  const id = attr(el, "id") ?? "";
  const classes = (attr(el, "class") ?? "").split(/[\s]+/).filter(Boolean);
  const idMatch = sel.match(/#([\w-]+)/);
  const classMatches = sel.match(/\.[\w-]+/g) ?? [];
  const tagPart = sel
    .replace(/#[\w-]+/g, "")
    .replace(/\.[\w-]+/g, "")
    .trim();
  if (tagPart && tagPart !== "*" && tagPart !== tag) return false;
  if (idMatch && idMatch[1] !== id) return false;
  for (const c of classMatches) {
    if (!classes.includes(c.slice(1))) return false;
  }
  return true;
}

function stylesheetValue(
  el: Element,
  prop: string,
  rules: StyleRule[],
): string | undefined {
  let best: string | undefined;
  let bestSpec = -1;
  let bestOrder = -1;
  for (const rule of rules) {
    const val = rule.decls[prop];
    if (val == null) continue;
    for (const sel of rule.selectors) {
      if (!matchesSimpleSelector(el, sel)) continue;
      const spec = selectorSpecificity(sel);
      if (spec > bestSpec || (spec === bestSpec && rule.order >= bestOrder)) {
        best = val;
        bestSpec = spec;
        bestOrder = rule.order;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Gradient (<linearGradient> / <radialGradient> / <stop>) support
// ---------------------------------------------------------------------------

type GradientStopRaw = { offset: number; color: string; opacity: number };

type Affine = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

const IDENTITY_AFFINE: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mulAff(p: Affine, l: Affine): Affine {
  return {
    a: p.a * l.a + p.c * l.b,
    b: p.b * l.a + p.d * l.b,
    c: p.a * l.c + p.c * l.d,
    d: p.b * l.c + p.d * l.d,
    e: p.a * l.e + p.c * l.f + p.e,
    f: p.b * l.e + p.d * l.f + p.f,
  };
}

function applyAff(m: Affine, x: number, y: number): Pt {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Average + anisotropy of an affine map's linear part (for radii). */
function linearScaleInfo(m: Affine): { avg: number; anisotropic: boolean } {
  const n1 = Math.hypot(m.a, m.b);
  const n2 = Math.hypot(m.c, m.d);
  const avg = (n1 + n2) / 2;
  const anisotropic =
    Math.max(n1, n2) > 0 && Math.abs(n1 - n2) / Math.max(n1, n2) > 0.05;
  return { avg, anisotropic };
}

type GradientDef = {
  id: string;
  kind: "linear" | "radial";
  /** Raw geometry strings (resolved along the href chain later). */
  raw: {
    x1?: string;
    y1?: string;
    x2?: string;
    y2?: string;
    cx?: string;
    cy?: string;
    r?: string;
  };
  units?: string;
  gradientTransformRaw?: string;
  /** Own stops only (empty when inherited via href). */
  stops: GradientStopRaw[];
  href?: string;
};

function parseFraction(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : fallback;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : fallback;
}

function parseStopOffset(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n)
      ? Math.max(0, Math.min(1, n / 100))
      : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function rawAttr(el: Element, name: string): string | undefined {
  const v = attr(el, name);
  if (v == null || v.trim() === "") return undefined;
  return v.trim();
}

function parseGradientElement(el: Element, id: string): GradientDef | null {
  const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
  const isLinear = tag === "lineargradient";
  const isRadial = tag === "radialgradient";
  if (!isLinear && !isRadial) return null;
  const units = rawAttr(el, "gradientUnits");
  const gradientTransformRaw =
    rawAttr(el, "gradientTransform") ?? undefined;
  if (gradientTransformRaw && /skewx|skewy/i.test(gradientTransformRaw)) {
    warnOnce(
      `gradient-skew:${id}`,
      `gradient "#${id}" gradientTransform contains skew; skew is ignored (limitation).`,
    );
  }
  const def: GradientDef = {
    id,
    kind: isLinear ? "linear" : "radial",
    raw: {
      x1: rawAttr(el, "x1"),
      y1: rawAttr(el, "y1"),
      x2: rawAttr(el, "x2"),
      y2: rawAttr(el, "y2"),
      cx: rawAttr(el, "cx"),
      cy: rawAttr(el, "cy"),
      r: rawAttr(el, "r"),
    },
    units,
    gradientTransformRaw,
    stops: [],
  };
  const href =
    rawAttr(el, "href") ?? rawAttr(el, "xlink:href") ?? rawAttr(el, "xlinkHref");
  if (href?.startsWith("#") && href.length > 1) {
    def.href = href.slice(1);
  }
  // Inkscape stores stop paint in `style="stop-color:...;stop-opacity:..."`.
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase().replace(/^svg:/, "") !== "stop") continue;
    const offset = parseStopOffset(attr(child, "offset"));
    if (offset == null) continue;
    const inline = parseInlineStyle(child);
    const color =
      rawAttr(child, "stop-color") ?? inline["stop-color"] ?? "#000000";
    const opacityRaw =
      rawAttr(child, "stop-opacity") ?? inline["stop-opacity"] ?? "1";
    const opacity = parseFloat(opacityRaw);
    def.stops.push({
      offset,
      color: color.trim() || "#000000",
      opacity: Number.isFinite(opacity)
        ? Math.max(0, Math.min(1, opacity))
        : 1,
    });
  }
  def.stops.sort((a, b) => a.offset - b.offset);
  return def;
}

/** Collect gradient definitions by id (namespace-agnostic scan). */
function collectGradients(doc: Document): Map<string, GradientDef> {
  const map = new Map<string, GradientDef>();
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
    if (tag !== "lineargradient" && tag !== "radialgradient") continue;
    const id = attr(el, "id");
    if (!id || map.has(id)) continue;
    const def = parseGradientElement(el, id);
    if (def) map.set(id, def);
  }
  return map;
}

type EffectiveGradient = {
  kind: "linear" | "radial";
  raw: NonNullable<GradientDef["raw"]>;
  units: string;
  gradientTransform: Affine;
  hasGradientTransform: boolean;
  stops: GradientStopRaw[];
};

/**
 * Resolve the `href`/`xlink:href` reference chain (multi-level) into one
 * effective gradient. Nearest-defined attribute wins; stops come from the
 * nearest definition that owns any. Cycles terminate with a warning.
 */
function resolveGradientChain(
  id: string,
  map: Map<string, GradientDef>,
): EffectiveGradient | null {
  const visited = new Set<string>();
  let kind: "linear" | "radial" | undefined;
  const raw: EffectiveGradient["raw"] = {};
  let units: string | undefined;
  let gradientTransform: Affine | undefined;
  let hasGradientTransform = false;
  let stops: GradientStopRaw[] | undefined;
  let cur: string | undefined = id;
  while (cur) {
    if (visited.has(cur)) {
      warnOnce(
        `gradient-cycle:${id}`,
        `gradient "#${id}" has a cyclic href chain; chain truncated.`,
      );
      break;
    }
    visited.add(cur);
    const def = map.get(cur);
    if (!def) {
      if (cur !== id) {
        warnOnce(
          `gradient-dangling:${id}`,
          `gradient "#${id}" references missing "#${cur}"; inherited attributes unavailable.`,
        );
      }
      break;
    }
    kind ??= def.kind;
    (Object.keys(def.raw) as (keyof typeof raw)[]).forEach((k) => {
      raw[k] ??= def.raw[k];
    });
    if (units == null && def.units != null) units = def.units;
    if (!hasGradientTransform && def.gradientTransformRaw != null) {
      gradientTransform = parseTransform(def.gradientTransformRaw);
      hasGradientTransform = true;
    }
    if (stops == null && def.stops.length > 0) stops = def.stops;
    cur = def.href;
  }
  if (!kind || !stops?.length) return null;
  return {
    kind,
    raw,
    units: units ?? "objectBoundingBox",
    gradientTransform: gradientTransform ?? { ...IDENTITY_AFFINE },
    hasGradientTransform,
    stops,
  };
}

function parseUserNumber(raw: string | undefined, fallback: number, id: string): number {
  if (raw == null || raw === "") return fallback;
  if (raw.includes("%")) {
    warnOnce(
      `gradient-percent-userspace:${id}`,
      `gradient uses percentage coordinates in userSpaceOnUse; treated as raw numbers (limitation).`,
    );
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

type ShapeBBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Bake an effective gradient into the editor's objectBoundingBox
 * `GradientFill`, given the referencing element's ancestor matrix and the
 * baked shape bounds. Both `objectBoundingBox` and `userSpaceOnUse`
 * (with `gradientTransform`) are resolved to explicit vectors so no
 * gradient information is lost at import time.
 */
function bakeGradientFill(
  id: string,
  eff: EffectiveGradient,
  ancestorMat: Affine,
  bbox: ShapeBBox,
): import("@/types/project").GradientFill | null {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const stops = eff.stops.map((stop) => ({
    offset: stop.offset,
    color: withAlpha(stop.color, stop.opacity) ?? stop.color,
  }));
  const toU = (x: number, y: number): { x: number; y: number } => ({
    x: w > 1e-9 ? (x - bbox.minX) / w : 0.5,
    y: h > 1e-9 ? (y - bbox.minY) / h : 0.5,
  });
  if (eff.units !== "objectBoundingBox" && eff.units !== "userSpaceOnUse") {
    warnOnce(
      `gradient-units:${id}`,
      `gradient "#${id}" uses gradientUnits="${eff.units}"; treated as objectBoundingBox (limitation).`,
    );
  }
  const userSpace = eff.units === "userSpaceOnUse";
  const G = eff.gradientTransform;
  if (eff.kind === "linear") {
    let p1: Pt;
    let p2: Pt;
    if (userSpace) {
      // Gradient vector lives in the referencing element's user space:
      // apply gradientTransform first, then the ancestor matrix.
      const M = mulAff(ancestorMat, G);
      p1 = applyAff(
        M,
        parseUserNumber(eff.raw.x1, 0, id),
        parseUserNumber(eff.raw.y1, 0, id),
      );
      p2 = applyAff(
        M,
        parseUserNumber(eff.raw.x2, 1, id),
        parseUserNumber(eff.raw.y2, 0, id),
      );
    } else {
      const q1 = applyAff(
        G,
        parseFraction(eff.raw.x1, 0),
        parseFraction(eff.raw.y1, 0),
      );
      const q2 = applyAff(
        G,
        parseFraction(eff.raw.x2, 1),
        parseFraction(eff.raw.y2, 0),
      );
      p1 = { x: bbox.minX + q1.x * w, y: bbox.minY + q1.y * h };
      p2 = { x: bbox.minX + q2.x * w, y: bbox.minY + q2.y * h };
    }
    const u1 = toU(p1.x, p1.y);
    const u2 = toU(p2.x, p2.y);
    return { type: "linear", x1: u1.x, y1: u1.y, x2: u2.x, y2: u2.y, stops };
  }
  // Radial: center is exactly representable; radius uses the average
  // linear scale (warned when the map is anisotropic).
  const combined = userSpace ? mulAff(ancestorMat, G) : G;
  const { avg, anisotropic } = linearScaleInfo(combined);
  if (anisotropic) {
    warnOnce(
      `gradient-anisotropic:${id}`,
      `gradient "#${id}" has an anisotropic transform; radial radius averaged (limitation).`,
    );
  }
  let cRoot: Pt;
  let rRoot: number;
  if (userSpace) {
    const c = applyAff(
      combined,
      parseUserNumber(eff.raw.cx, 0.5, id),
      parseUserNumber(eff.raw.cy, 0.5, id),
    );
    cRoot = c;
    rRoot = parseUserNumber(eff.raw.r, 0.5, id) * avg;
  } else {
    const c = applyAff(
      G,
      parseFraction(eff.raw.cx, 0.5),
      parseFraction(eff.raw.cy, 0.5),
    );
    cRoot = { x: bbox.minX + c.x * w, y: bbox.minY + c.y * h };
    rRoot = parseFraction(eff.raw.r, 0.5) * avg * Math.max(w, h);
  }
  const uc = toU(cRoot.x, cRoot.y);
  const maxSide = Math.max(w, h);
  return {
    type: "radial",
    cx: uc.x,
    cy: uc.y,
    r: maxSide > 1e-9 ? rRoot / maxSide : 0.5,
    stops,
  };
}

// ---------------------------------------------------------------------------
// Color + alpha helpers (existing color representations are preserved)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1,
    ];
  }
  if (/^[0-9a-fA-F]{8}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255,
    ];
  }
  return null;
}

function parseRgbFn(color: string): [number, number, number, number] | null {
  const m = color
    .trim()
    .match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (!m) return null;
  // Support both comma syntax and space/slash syntax.
  const body = m[1]!.includes(",")
    ? m[1]!.split(",").map((s) => s.trim())
    : m[1]!.split("/").map((s) => s.trim());
  let comps: string[];
  let alpha = 1;
  if (m[1]!.includes(",")) {
    comps = body;
    if (comps.length === 4) {
      const a = parseAlphaValue(comps[3]!);
      if (a == null) return null;
      alpha = a;
    } else if (comps.length !== 3) {
      return null;
    }
  } else {
    const slashParts = m[1]!.split("/");
    const rgbParts = slashParts[0]!.trim().split(/[\s]+/);
    if (rgbParts.length !== 3) return null;
    comps = rgbParts;
    if (slashParts[1] != null && slashParts[1].trim() !== "") {
      const a = parseAlphaValue(slashParts[1]!.trim());
      if (a == null) return null;
      alpha = a;
    }
  }
  const nums = comps.slice(0, 3).map((c) => parseComponentValue(c));
  if (nums.some((n) => n == null)) return null;
  return [nums[0]!, nums[1]!, nums[2]!, alpha];
}

function parseComponentValue(raw: string): number | null {
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n)
      ? Math.max(0, Math.min(255, Math.round((n / 100) * 255)))
      : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : null;
}

function parseAlphaValue(raw: string): number | null {
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

/**
 * Fold an opacity multiplier into an existing CSS color string.
 * Returns the original string when alpha is 1, an `rgba(...)` string when
 * the color can be represented, or `null` when it cannot (caller then
 * folds the alpha into element opacity instead of dropping it silently).
 */
function withAlpha(color: string, alpha: number): string | null {
  if (!Number.isFinite(alpha) || alpha >= 1) return color;
  // NOTE: alpha === 0 must keep the original RGB (transparent red ≠
  // transparent black: mid-gradient interpolation would go through gray).
  const c = color.trim();
  if (c.startsWith("#")) {
    const rgb = hexToRgb(c);
    if (!rgb) return null;
    const a = Math.max(0, Math.min(1, rgb[3] * alpha));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(a.toFixed(4))})`;
  }
  const rgb = parseRgbFn(c);
  if (rgb) {
    const a = Math.max(0, Math.min(1, rgb[3] * alpha));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(a.toFixed(4))})`;
  }
  return null;
}

const warnedOnce = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`[svgImport] ${message}`);
}

// ---------------------------------------------------------------------------
// Paint cascade
// ---------------------------------------------------------------------------

/**
 * Debug/staging switches for bisecting import failures. All default to
 * false (full import). Used by diagnostics to isolate which stage drops
 * shapes (clip / display / opacity / gradient / stroke).
 */
export type SvgParseOptions = {
  ignoreClipPaths?: boolean;
  ignoreDisplayVisibility?: boolean;
  forceFullOpacity?: boolean;
  solidGradients?: boolean;
  ignoreStrokeAttrs?: boolean;
  /** When provided, skip/warn reasons are appended here (capped). */
  collectLog?: string[];
};

type ClipDef = {
  id: string;
  /** As specified; default per spec is userSpaceOnUse. */
  units: string;
  children: Element[];
};

type ImportCtx = {
  gradients: Map<string, GradientDef>;
  styleRules: StyleRule[];
  clips: Map<string, ClipDef>;
  /** ids of <pattern> paint servers (explicitly unsupported as vector fill). */
  patterns: Set<string>;
  opts: SvgParseOptions;
};

function logMsg(ctx: ImportCtx, msg: string): void {
  const log = ctx.opts.collectLog;
  if (log && log.length < 500) log.push(msg);
}

/** A clip-path use site: definition + ancestor matrix of the user space. */
type ClipFrame = {
  def: ClipDef;
  baseMat: Affine;
};

type PaintSpec = {
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  strokeMiterlimit?: string;
  strokeDasharray?: string;
  strokeDashoffset?: string;
  opacity?: string;
  fillOpacity?: string;
  strokeOpacity?: string;
  fillRule?: string;
  color?: string;
  clipPath?: string;
  display?: string;
  visibility?: string;
  /** Own element only (not inherited per spec). */
  vectorEffect?: string;
};

/**
 * Cascade order (low → high), per SVG-import requirements:
 * inherited → stylesheet (`<style>`/class) → presentation attribute →
 * inline `style`. (`inherit` keyword falls through to the next level.)
 */
function cascadedSpec(
  el: Element,
  inherited: Inherited,
  ctx: ImportCtx,
): PaintSpec {
  const inline = parseInlineStyle(el);
  const pick = (
    prop: string,
    fallback?: string,
  ): string | undefined => {
    const inlineVal = inline[prop];
    if (inlineVal != null && inlineVal !== "" && inlineVal !== "inherit") {
      return inlineVal;
    }
    const presVal = attr(el, prop);
    if (presVal != null && presVal !== "") {
      const t = presVal.trim();
      if (t !== "" && t.toLowerCase() !== "inherit") return t;
    }
    const ssVal = stylesheetValue(el, prop, ctx.styleRules);
    if (ssVal != null && ssVal !== "" && ssVal.toLowerCase() !== "inherit") {
      return ssVal;
    }
    if (inlineVal?.toLowerCase() === "inherit") return fallback;
    return fallback;
  };
  return {
    fill: pick("fill", inherited.fill),
    stroke: pick("stroke", inherited.stroke),
    strokeWidth: pick("stroke-width") ?? pick("strokeWidth"),
    strokeLinecap: pick("stroke-linecap", inherited.strokeLinecap),
    strokeLinejoin: pick("stroke-linejoin", inherited.strokeLinejoin),
    strokeMiterlimit: pick("stroke-miterlimit"),
    strokeDasharray: pick("stroke-dasharray"),
    strokeDashoffset: pick("stroke-dashoffset"),
    opacity: pick("opacity"),
    fillOpacity: pick("fill-opacity"),
    strokeOpacity: pick("stroke-opacity"),
    fillRule: pick("fill-rule", inherited.fillRule),
    color: pick("color", inherited.color),
    clipPath: pick("clip-path"),
    display: pick("display"),
    visibility: pick("visibility", inherited.visibility),
    vectorEffect: pick("vector-effect"),
  };
}

/** Deferred gradient bake: resolved after the shape bounds are known. */
type GradientBake = {
  id: string;
  eff: EffectiveGradient;
  ancestorMat: Affine;
};

type ResolvedPaint = {
  fill?: string;
  /** Set when `fill` references a resolvable gradient (baked per-shape). */
  gradientBake?: GradientBake;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeMiterlimit?: number;
  strokeDasharray?: number[];
  strokeDashoffset?: number;
  opacity: number;
  fillRule: "nonzero" | "evenodd";
  color: string;
  spec: PaintSpec;
  nextInherited: Inherited;
};

function parseUrlRef(specified: string): { id: string; fallback: string } | null {
  const urlMatch = specified.trim().match(/^url\(\s*#([^)\s]+)\s*\)(.*)$/i);
  if (!urlMatch) return null;
  return { id: urlMatch[1]!, fallback: urlMatch[2]!.trim() };
}

function resolveFillPaintValue(
  specified: string | undefined,
  ctx: ImportCtx,
  ancestorMat: Affine,
): { fill?: string; gradientBake?: GradientBake } {
  if (specified == null || specified.trim() === "") {
    return { fill: SPEC_FILL_INITIAL };
  }
  const s = specified.trim();
  const lower = s.toLowerCase();
  if (lower === "none") return {};
  const urlRef = parseUrlRef(s);
  if (urlRef) {
    const eff = resolveGradientChain(urlRef.id, ctx.gradients);
    if (eff) {
      // Baking is deferred until the shape bounds are known; the solid
      // fallback carries the first stop so non-gradient painters still
      // show a principled color (never an arbitrary blue).
      const first = eff.stops[0]!;
      return {
        fill: withAlpha(first.color, first.opacity) ?? first.color,
        gradientBake: { id: urlRef.id, eff, ancestorMat: { ...ancestorMat } },
      };
    }
    if (ctx.patterns.has(urlRef.id)) {
      warnOnce(
        `pattern-fill:${urlRef.id}`,
        `paint "url(#${urlRef.id})" is a <pattern>; pattern fills are not vectorized (limitation). Imported as transparent.`,
      );
      return {};
    }
    if (urlRef.fallback) return { fill: urlRef.fallback };
    warnOnce(
      `gradient-missing:${urlRef.id}`,
      `paint "url(#${urlRef.id})" has no resolvable gradient; imported as transparent (not a default color).`,
    );
    return {};
  }
  if (lower === "currentcolor") return { fill: SPEC_FILL_INITIAL };
  if (lower === "context-fill" || lower === "context-stroke") {
    return { fill: SPEC_FILL_INITIAL };
  }
  return { fill: s };
}

function resolveStrokePaintValue(
  specified: string | undefined,
  ctx: ImportCtx,
): string | undefined {
  if (specified == null || specified.trim() === "") return undefined;
  const s = specified.trim();
  const lower = s.toLowerCase();
  if (lower === "none") return undefined;
  const urlRef = parseUrlRef(s);
  if (urlRef) {
    const eff = resolveGradientChain(urlRef.id, ctx.gradients);
    // No stroke-gradient channel exists in the internal model: fall back
    // to the first stop color (principled) instead of an arbitrary color.
    if (eff) {
      warnOnce(
        `stroke-gradient:${urlRef.id}`,
        `stroke "url(#${urlRef.id})" imported as its first stop color; stroke gradients are unsupported (limitation).`,
      );
      const first = eff.stops[0]!;
      return withAlpha(first.color, first.opacity) ?? first.color;
    }
    if (ctx.patterns.has(urlRef.id)) {
      warnOnce(
        `pattern-stroke:${urlRef.id}`,
        `stroke "url(#${urlRef.id})" is a <pattern>; pattern strokes are unsupported (limitation).`,
      );
      return undefined;
    }
    if (urlRef.fallback) return urlRef.fallback;
    warnOnce(
      `stroke-gradient-missing:${urlRef.id}`,
      `stroke "url(#${urlRef.id})" has no resolvable gradient; imported without stroke.`,
    );
    return undefined;
  }
  if (lower === "currentcolor") return SPEC_FILL_INITIAL;
  return s;
}

function parseLinecap(
  raw: string | undefined,
): ResolvedPaint["strokeLinecap"] {
  const v = raw?.trim().toLowerCase();
  return v === "butt" || v === "round" || v === "square" ? v : undefined;
}

function parseLinejoin(
  raw: string | undefined,
): ResolvedPaint["strokeLinejoin"] {
  const v = raw?.trim().toLowerCase();
  return v === "miter" || v === "round" || v === "bevel" ? v : undefined;
}

function parseDasharray(raw: string | undefined): number[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  if (raw.trim().toLowerCase() === "none") return undefined;
  const nums = raw
    .trim()
    .split(/[\s,]+/)
    .map(parseFloat)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length ? nums : undefined;
}

function resolvePaintForElement(
  el: Element,
  inherited: Inherited,
  ctx: ImportCtx,
  ancestorMat: Affine,
): ResolvedPaint {
  const spec = cascadedSpec(el, inherited, ctx);
  const color = spec.color?.trim() || inherited.color || SPEC_FILL_INITIAL;

  const fillResolved = resolveFillPaintValue(spec.fill, ctx, ancestorMat);
  let fill = fillResolved.fill;
  const gradientBake = fillResolved.gradientBake;

  let stroke = resolveStrokePaintValue(spec.stroke, ctx);

  let strokeWidth: number | undefined;
  if (spec.strokeWidth != null && spec.strokeWidth !== "") {
    const n = parseFloat(spec.strokeWidth);
    strokeWidth = Number.isFinite(n)
      ? n
      : inherited.strokeWidthValue;
  } else {
    strokeWidth = inherited.strokeWidthValue;
  }

  // Opacity: element opacity multiplies down the tree. fill-/stroke-opacity
  // are baked into their paint colors when representable; otherwise they
  // degrade into the element opacity instead of being dropped silently.
  // forceFullOpacity (staging) disables all of this for bisection.
  const fullOpacity = ctx.opts.forceFullOpacity === true;
  let opacity = inherited.opacity;
  if (!fullOpacity) {
    if (spec.opacity != null && spec.opacity !== "") {
      const n = parseAlphaValue(spec.opacity);
      if (n != null) opacity = inherited.opacity * n;
    }
    if (spec.fillOpacity != null && spec.fillOpacity !== "" && fill) {
      const n = parseAlphaValue(spec.fillOpacity);
      if (n != null && n < 1) {
        const folded = withAlpha(fill, n);
        if (folded != null) fill = folded;
        else opacity *= n;
      }
    }
    if (spec.strokeOpacity != null && spec.strokeOpacity !== "" && stroke) {
      const n = parseAlphaValue(spec.strokeOpacity);
      if (n != null && n < 1) {
        const folded = withAlpha(stroke, n);
        if (folded != null) stroke = folded;
        else opacity *= n;
      }
    }
  } else {
    opacity = 1;
  }

  const ruleRaw = (spec.fillRule ?? "").trim().toLowerCase();
  const fillRule: "nonzero" | "evenodd" =
    ruleRaw === "evenodd" || ruleRaw === "nonzero"
      ? ruleRaw
      : (inherited.fillRule ?? "nonzero");

  const noStrokeAttrs = ctx.opts.ignoreStrokeAttrs === true;
  const strokeLinecap = noStrokeAttrs
    ? undefined
    : (parseLinecap(spec.strokeLinecap) ?? inherited.strokeLinecap);
  const strokeLinejoin = noStrokeAttrs
    ? undefined
    : (parseLinejoin(spec.strokeLinejoin) ?? inherited.strokeLinejoin);
  let strokeMiterlimit: number | undefined;
  if (noStrokeAttrs) {
    strokeMiterlimit = undefined;
  } else if (spec.strokeMiterlimit != null && spec.strokeMiterlimit !== "") {
    const n = parseFloat(spec.strokeMiterlimit);
    strokeMiterlimit = Number.isFinite(n) && n > 0 ? n : inherited.strokeMiterlimit;
  } else {
    strokeMiterlimit = inherited.strokeMiterlimit;
  }
  const strokeDasharray = noStrokeAttrs
    ? undefined
    : (parseDasharray(spec.strokeDasharray) ?? inherited.strokeDasharray);
  let strokeDashoffset: number | undefined;
  if (noStrokeAttrs) {
    strokeDashoffset = undefined;
  } else if (spec.strokeDashoffset != null && spec.strokeDashoffset !== "") {
    const n = parseFloat(spec.strokeDashoffset);
    strokeDashoffset = Number.isFinite(n) ? n : inherited.strokeDashoffset;
  } else {
    strokeDashoffset = inherited.strokeDashoffset;
  }

  const visibilityRaw = (spec.visibility ?? "").trim().toLowerCase();
  const visibility =
    visibilityRaw === "visible" ||
    visibilityRaw === "hidden" ||
    visibilityRaw === "collapse"
      ? visibilityRaw
      : (inherited.visibility ?? "visible");

  // `color` inherits for currentColor descendants.
  const nextColor =
    spec.color && spec.color.trim() !== "" ? spec.color.trim() : color;

  const nextInherited: Inherited = {
    fill: spec.fill,
    stroke: spec.stroke,
    strokeWidth: spec.strokeWidth,
    strokeWidthValue: strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    strokeMiterlimit,
    strokeDasharray,
    strokeDashoffset,
    opacity,
    fillRule,
    color: nextColor,
    visibility,
  };
  return {
    fill,
    gradientBake,
    stroke,
    strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    strokeMiterlimit,
    strokeDasharray,
    strokeDashoffset,
    opacity,
    fillRule,
    color,
    spec,
    nextInherited,
  };
}

/**
 * Stroke widths live in user units, so ancestor/self transforms scale
 * their rendered size (SVG default; `vector-effect="non-scaling-stroke"`
 * opts out). Geometry is baked with the full matrix, therefore the width
 * must be baked with the matrix's representative scale as well —
 * otherwise uniformly-drawn artwork imports with wildly varying widths.
 * Non-uniform scales have no single correct value: the mean axis scale
 * is used (warned).
 */
function strokeWidthScale(mat: Affine, vectorEffectRaw?: string): number {
  if (
    (vectorEffectRaw ?? "").trim().toLowerCase() === "non-scaling-stroke"
  ) {
    return 1;
  }
  const sx = Math.hypot(mat.a, mat.b);
  const sy = Math.hypot(mat.c, mat.d);
  if (!(sx > 0) || !(sy > 0)) return 1;
  if (Math.max(sx, sy) / Math.min(sx, sy) > 1.05) {
    warnOnce(
      "stroke-nonuniform",
      "non-uniform transform on a stroked element; stroke-width scaled by the mean axis scale (limitation).",
    );
  }
  return (sx + sy) / 2;
}

// ---------------------------------------------------------------------------
// Clip paths
// ---------------------------------------------------------------------------

function collectClipPaths(doc: Document): Map<string, ClipDef> {
  const map = new Map<string, ClipDef>();
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (el.tagName.toLowerCase().replace(/^svg:/, "") !== "clippath") continue;
    const id = attr(el, "id");
    if (!id || map.has(id)) continue;
    const units = (rawAttr(el, "clipPathUnits") ?? "userSpaceOnUse").trim();
    map.set(id, { id, units, children: Array.from(el.children) });
  }
  return map;
}

function collectPatternIds(doc: Document): Set<string> {
  const set = new Set<string>();
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (el.tagName.toLowerCase().replace(/^svg:/, "") !== "pattern") continue;
    const id = attr(el, "id");
    if (id) set.add(id);
  }
  return set;
}

/** Bake clip-path children into root-space polygons under `baseMat`. */
function bakeClipChildren(children: Element[], baseMat: Affine): Pt[][] {
  const out: Pt[][] = [];
  const walk = (el: Element, mat: Affine) => {
    const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
    const m = combineMatrix(
      { a: mat.a, b: mat.b, c: mat.c, d: mat.d, e: mat.e, f: mat.f },
      attr(el, "transform"),
    );
    const am: Affine = { ...m };
    if (tag === "rect") {
      const x = num(attr(el, "x"));
      const y = num(attr(el, "y"));
      const w = num(attr(el, "width"));
      const h = num(attr(el, "height"));
      if (w > 0 && h > 0) {
        if (num(attr(el, "rx")) > 0 || num(attr(el, "ry")) > 0) {
          warnOnce(
            "clip-rounded-rect",
            "rounded <rect> in <clipPath> is clipped as a sharp rect (limitation).",
          );
        }
        out.push([
          applyAff(am, x, y),
          applyAff(am, x + w, y),
          applyAff(am, x + w, y + h),
          applyAff(am, x, y + h),
        ]);
      }
      return;
    }
    if (tag === "circle" || tag === "ellipse") {
      const cx = num(attr(el, "cx"));
      const cy = num(attr(el, "cy"));
      const rx = tag === "circle" ? num(attr(el, "r")) : num(attr(el, "rx"));
      const ry = tag === "circle" ? num(attr(el, "r")) : num(attr(el, "ry"));
      if (rx > 0 && ry > 0) {
        const pts: Pt[] = [];
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          pts.push(applyAff(am, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
        }
        out.push(pts);
      }
      return;
    }
    if (tag === "path") {
      const d = attr(el, "d");
      if (!d) return;
      const { subpaths } = pathDToSubpaths(d, {
        a: am.a, b: am.b, c: am.c, d: am.d, e: am.e, f: am.f,
      });
      for (const sp of subpaths) if (sp.length >= 3) out.push(sp);
      return;
    }
    if (tag === "polygon" || tag === "polyline") {
      const nums = (attr(el, "points") ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter((n) => Number.isFinite(n));
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push(applyAff(am, nums[i]!, nums[i + 1]!));
      }
      if (pts.length >= 3) out.push(pts);
      return;
    }
    if (tag === "g" || tag === "a") {
      for (const child of Array.from(el.children)) walk(child, am);
    }
  };
  for (const child of children) walk(child, baseMat);
  return out;
}

/**
 * Finalize stacked clip frames into shape-local clip groups, given the
 * baked shape bounds + center. Entries intersect; paths unite per entry.
 */
function bakeClipGroups(
  frames: ClipFrame[],
  bbox: ShapeBBox,
  cx: number,
  cy: number,
): { paths: Pt[][] }[] | undefined {
  if (!frames.length) return undefined;
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const groups: { paths: Pt[][] }[] = [];
  for (const frame of frames) {
    const { def, baseMat } = frame;
    let rootPolys: Pt[][];
    if (def.units === "objectBoundingBox") {
      // Fraction-space bake: map the unit square onto the bbox, then run
      // the same child baker (child transforms compose on top).
      const unit: Affine = {
        a: w, b: 0, c: 0, d: h, e: bbox.minX, f: bbox.minY,
      };
      rootPolys = bakeClipChildren(def.children, unit);
    } else {
      if (def.units !== "userSpaceOnUse") {
        warnOnce(
          `clip-units:${def.id}`,
          `clipPath "#${def.id}" uses clipPathUnits="${def.units}"; treated as userSpaceOnUse (limitation).`,
        );
      }
      rootPolys = bakeClipChildren(def.children, baseMat);
    }
    const local = rootPolys
      .map((poly) => poly.map((p) => ({ x: p.x - cx, y: p.y - cy })))
      .filter((poly) => poly.length >= 3);
    if (local.length) groups.push({ paths: local });
    else {
      warnOnce(
        `clip-empty:${def.id}`,
        `clipPath "#${def.id}" produced no usable geometry; clip ignored for one or more shapes.`,
      );
    }
  }
  return groups.length ? groups : undefined;
}

/** Bake gradient + clips for one shape, given baked bounds + center. */
function finalizeShapePaint(
  paint: ResolvedPaint,
  bbox: ShapeBBox,
  cx: number,
  cy: number,
  clipFrames: ClipFrame[],
  opts?: SvgParseOptions,
): {
  fillGradient?: import("@/types/project").GradientFill;
  clip?: { paths: Pt[][] }[];
} {
  let fillGradient: import("@/types/project").GradientFill | undefined;
  if (paint.gradientBake && opts?.solidGradients !== true) {
    const baked = bakeGradientFill(
      paint.gradientBake.id,
      paint.gradientBake.eff,
      paint.gradientBake.ancestorMat,
      bbox,
    );
    if (baked) {
      fillGradient = baked;
    } else {
      warnOnce(
        `gradient-bake-fail:${paint.gradientBake.id}`,
        `gradient "#${paint.gradientBake.id}" could not be baked; solid fallback kept.`,
      );
    }
  }
  const clip = bakeClipGroups(clipFrames, bbox, cx, cy);
  return { fillGradient, clip };
}

/** Parse a minimal subset of SVG transform: translate, scale, matrix, rotate. */
function parseTransform(raw: string | null): {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
} {
  let a = 1,
    b = 0,
    c = 0,
    d = 1,
    e = 0,
    f = 0;
  if (!raw) return { a, b, c, d, e, f };

  const multiply = (
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    e2: number,
    f2: number,
  ) => {
    const na = a * a2 + c * b2;
    const nb = b * a2 + d * b2;
    const nc = a * c2 + c * d2;
    const nd = b * c2 + d * d2;
    const ne = a * e2 + c * f2 + e;
    const nf = b * e2 + d * f2 + f;
    a = na;
    b = nb;
    c = nc;
    d = nd;
    e = ne;
    f = nf;
  };

  const re =
    /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const kind = m[1]!.toLowerCase();
    const args = m[2]!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (kind === "matrix" && args.length >= 6) {
      multiply(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!);
    } else if (kind === "translate") {
      multiply(1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0);
    } else if (kind === "scale") {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      multiply(sx, 0, 0, sy, 0, 0);
    } else if (kind === "rotate") {
      const ang = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      if (cx || cy) multiply(1, 0, 0, 1, cx, cy);
      multiply(cos, sin, -sin, cos, 0, 0);
      if (cx || cy) multiply(1, 0, 0, 1, -cx, -cy);
    }
  }
  return { a, b, c, d, e, f };
}

function applyMatrix(
  mat: { a: number; b: number; c: number; d: number; e: number; f: number },
  x: number,
  y: number,
): Pt {
  return {
    x: mat.a * x + mat.c * y + mat.e,
    y: mat.b * x + mat.d * y + mat.f,
  };
}

function combineMatrix(
  parent: ReturnType<typeof parseTransform>,
  local: string | null,
): ReturnType<typeof parseTransform> {
  const m = parseTransform(local);
  // parent * local
  return {
    a: parent.a * m.a + parent.c * m.b,
    b: parent.b * m.a + parent.d * m.b,
    c: parent.a * m.c + parent.c * m.d,
    d: parent.b * m.c + parent.d * m.d,
    e: parent.a * m.e + parent.c * m.f + parent.e,
    f: parent.b * m.e + parent.d * m.f + parent.f,
  };
}

// ---------------------------------------------------------------------------
// Path data → polyline points (curves sampled)
// ---------------------------------------------------------------------------

function sampleCubic(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  steps = 8,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y,
    });
  }
  return out;
}

function sampleQuadratic(p0: Pt, p1: Pt, p2: Pt, steps = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/** Tokenize SVG path `d` into command + number args. */
function tokenizePath(d: string): Array<{ cmd: string; args: number[] }> {
  const tokens: Array<{ cmd: string; args: number[] }> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let current: { cmd: string; args: number[] } | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    if (match[1]) {
      if (current) tokens.push(current);
      current = { cmd: match[1], args: [] };
    } else if (match[2] && current) {
      current.args.push(parseFloat(match[2]));
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function pathDToSubpaths(d: string, mat: ReturnType<typeof parseTransform>): {
  subpaths: Pt[][];
  closed: boolean[];
} {
  const tokens = tokenizePath(d);
  const subpaths: Pt[][] = [];
  const closed: boolean[] = [];
  let current: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: Pt | null = null;
  let lastCmd = "";

  const pushPoint = (x: number, y: number) => {
    const p = applyMatrix(mat, x, y);
    current.push(p);
    cx = x;
    cy = y;
  };

  const ensureSub = () => {
    if (current.length) {
      subpaths.push(current);
      closed.push(false);
      current = [];
    }
  };

  for (const tok of tokens) {
    const cmd = tok.cmd;
    const a = tok.args;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "M") {
      ensureSub();
      for (let i = 0; i + 1 < a.length; i += 2) {
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        if (i === 0) {
          pushPoint(x, y);
          startX = x;
          startY = y;
        } else {
          // implicit L
          pushPoint(x, y);
        }
      }
      lastCtrl = null;
    } else if (C === "L") {
      for (let i = 0; i + 1 < a.length; i += 2) {
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        pushPoint(x, y);
      }
      lastCtrl = null;
    } else if (C === "H") {
      for (const v of a) {
        const x = rel ? cx + v : v;
        pushPoint(x, cy);
      }
      lastCtrl = null;
    } else if (C === "V") {
      for (const v of a) {
        const y = rel ? cy + v : v;
        pushPoint(cx, y);
      }
      lastCtrl = null;
    } else if (C === "C") {
      for (let i = 0; i + 5 < a.length; i += 6) {
        const x1 = rel ? cx + a[i]! : a[i]!;
        const y1 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x2 = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y2 = rel ? cy + a[i + 3]! : a[i + 3]!;
        const x = rel ? cx + a[i + 4]! : a[i + 4]!;
        const y = rel ? cy + a[i + 5]! : a[i + 5]!;
        const p0 = { x: cx, y: cy };
        const samples = sampleCubic(p0, { x: x1, y: y1 }, { x: x2, y: y2 }, {
          x,
          y,
        });
        for (const s of samples) {
          const p = applyMatrix(mat, s.x, s.y);
          current.push(p);
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x2, y: y2 };
      }
    } else if (C === "S") {
      for (let i = 0; i + 3 < a.length; i += 4) {
        let x1 = cx;
        let y1 = cy;
        if (lastCtrl && (lastCmd === "C" || lastCmd === "S")) {
          x1 = 2 * cx - lastCtrl.x;
          y1 = 2 * cy - lastCtrl.y;
        }
        const x2 = rel ? cx + a[i]! : a[i]!;
        const y2 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y = rel ? cy + a[i + 3]! : a[i + 3]!;
        const samples = sampleCubic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x2, y: y2 };
      }
    } else if (C === "Q") {
      for (let i = 0; i + 3 < a.length; i += 4) {
        const x1 = rel ? cx + a[i]! : a[i]!;
        const y1 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y = rel ? cy + a[i + 3]! : a[i + 3]!;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x1, y: y1 };
      }
    } else if (C === "T") {
      for (let i = 0; i + 1 < a.length; i += 2) {
        let x1 = cx;
        let y1 = cy;
        if (lastCtrl && (lastCmd === "Q" || lastCmd === "T")) {
          x1 = 2 * cx - lastCtrl.x;
          y1 = 2 * cy - lastCtrl.y;
        }
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x1, y: y1 };
      }
    } else if (C === "A") {
      // Arc: approximate with line segments via endpoint parameterization (simplified)
      for (let i = 0; i + 6 < a.length; i += 7) {
        const x = rel ? cx + a[i + 5]! : a[i + 5]!;
        const y = rel ? cy + a[i + 6]! : a[i + 6]!;
        // Cheap approximation: sample along chord with a bulge via mid control
        const mx = (cx + x) / 2;
        const my = (cy + y) / 2;
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const large = a[i + 3]! !== 0;
        const sweep = a[i + 4]! !== 0;
        const bulge = (large ? 0.55 : 0.25) * (sweep ? 1 : -1);
        const ox = (-dy / len) * len * bulge;
        const oy = (dx / len) * len * bulge;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: mx + ox, y: my + oy },
          { x, y },
          10,
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
      }
      lastCtrl = null;
    } else if (C === "Z") {
      if (current.length) {
        current.push(applyMatrix(mat, startX, startY));
        subpaths.push(current);
        closed.push(true);
        current = [];
      }
      cx = startX;
      cy = startY;
      lastCtrl = null;
    }
    lastCmd = C;
  }
  ensureSub();
  return { subpaths, closed };
}

// ---------------------------------------------------------------------------
// Element collectors
// ---------------------------------------------------------------------------

type Inherited = {
  /** Specified (pre-gradient-resolution) values so `url(#...)` inherits. */
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeWidthValue?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeMiterlimit?: number;
  strokeDasharray?: number[];
  strokeDashoffset?: number;
  opacity: number;
  fillRule?: "nonzero" | "evenodd";
  color?: string;
  visibility?: string;
};

const ROOT_INHERITED: Inherited = { opacity: 1 };

type BakedPaintInput = {
  paint: ResolvedPaint;
  clipFrames: ClipFrame[];
  opts: SvgParseOptions;
};

function strokeProps(paint: ResolvedPaint): Pick<
  SvgImportShape,
  | "strokeLinecap"
  | "strokeLinejoin"
  | "strokeMiterlimit"
  | "strokeDasharray"
  | "strokeDashoffset"
> {
  return {
    strokeLinecap: paint.strokeLinecap,
    strokeLinejoin: paint.strokeLinejoin,
    strokeMiterlimit: paint.strokeMiterlimit,
    strokeDasharray: paint.strokeDasharray,
    strokeDashoffset: paint.strokeDashoffset,
  };
}

function makePathShape(
  points: Pt[],
  closed: boolean,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  extraSubpaths?: Pt[][],
  baked?: BakedPaintInput,
): SvgImportShape | null {
  if (points.length < 2) return null;
  // Center geometry at local origin for easier placement
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Pt) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const p of points) consider(p);
  for (const sp of extraSubpaths ?? []) for (const p of sp) consider(p);
  if (!Number.isFinite(minX)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const shift = (pts: Pt[]) => pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const paint = baked?.paint;
  const final = paint
    ? finalizeShapePaint(
        paint,
        { minX, minY, maxX, maxY },
        cx,
        cy,
        baked?.clipFrames ?? [],
        baked?.opts,
      )
    : {};

  return {
    type: "shape",
    shapeType: "path",
    localX: cx,
    localY: cy,
    points: shift(points),
    subpaths: extraSubpaths?.length
      ? extraSubpaths.map(shift)
      : undefined,
    closePath: closed,
    fill,
    fillGradient: final.fillGradient,
    stroke,
    strokeWidth: strokeWidth ?? (stroke ? 1 : undefined),
    ...(paint ? strokeProps(paint) : {}),
    fillRule: paint?.fillRule ?? "nonzero",
    opacity: paint?.opacity ?? 1,
    clip: final.clip,
  };
}

function collectFromElement(
  el: Element,
  parentMat: ReturnType<typeof parseTransform>,
  inherited: Inherited,
  out: SvgImportShape[],
  ctx: ImportCtx,
  clipFrames: ClipFrame[] = [],
): void {
  const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
  if (
    tag === "defs" ||
    tag === "lineargradient" ||
    tag === "radialgradient" ||
    tag === "stop" ||
    tag === "clippath" ||
    tag === "mask" ||
    tag === "title" ||
    tag === "desc" ||
    tag === "metadata" ||
    tag === "style" ||
    tag === "script"
  ) {
    return;
  }
  // Non-vector content cannot become paths: warn explicitly instead of
  // dropping silently (bitmap import remains available for these).
  if (
    tag === "image" ||
    tag === "text" ||
    tag === "tspan" ||
    tag === "tref" ||
    tag === "use" ||
    tag === "symbol" ||
    tag === "marker" ||
    tag === "pattern" ||
    tag === "foreignobject" ||
    tag === "view" ||
    tag === "font"
  ) {
    warnOnce(
      `unsupported-element:${tag}`,
      `<${tag}> is not converted to vector paths (explicit limitation; use bitmap import for these).`,
    );
    logMsg(ctx, `skip unsupported <${tag}> id=${attr(el, "id") ?? ""}`);
    return;
  }

  const mat = combineMatrix(parentMat, attr(el, "transform"));
  // NOTE: geometry handling below is intentionally untouched by the
  // paint/style work except clip/display plumbing; only paint resolution
  // changed here. parentMat is the user space for url()/clip references.
  const ancestorMat: Affine = { ...parentMat };
  const paint = resolvePaintForElement(el, inherited, ctx, ancestorMat);
  const { fill, stroke, strokeWidth } = paint;
  const nextInherited = paint.nextInherited;
  const enforceDV = !ctx.opts.ignoreDisplayVisibility;
  if (
    enforceDV &&
    (paint.spec.display ?? "").trim().toLowerCase() === "none"
  ) {
    logMsg(ctx, `skip display:none <${tag}> id=${attr(el, "id") ?? ""}`);
    return;
  }
  const hidden =
    enforceDV &&
    ((paint.spec.visibility ?? "").trim().toLowerCase() === "hidden" ||
      (paint.spec.visibility ?? "").trim().toLowerCase() === "collapse");

  // clip-path on a container applies to the whole subtree (intersects
  // with outer clips via the stacked frames).
  let frames = clipFrames;
  const clipRef =
    paint.spec.clipPath != null ? parseUrlRef(paint.spec.clipPath) : null;
  if (paint.spec.clipPath != null && paint.spec.clipPath.trim().toLowerCase() !== "none" && !clipRef) {
    warnOnce(
      "clip-path-syntax",
      `ignoring unsupported clip-path "${paint.spec.clipPath}" (only url(#id)/none supported).`,
    );
  }
  if (clipRef && !ctx.opts.ignoreClipPaths) {
    const def = ctx.clips.get(clipRef.id);
    if (def) {
      // userSpaceOnUse clip contents live in the specifying element's
      // own (transformed) space, so the base matrix MUST include this
      // element's transform (unlike gradients, which exclude it).
      const m: Affine = { a: mat.a, b: mat.b, c: mat.c, d: mat.d, e: mat.e, f: mat.f };
      frames = [...frames, { def, baseMat: m }];
    } else {
      warnOnce(
        `clip-missing:${clipRef.id}`,
        `clip-path "url(#${clipRef.id})" has no <clipPath> definition; imported unclipped.`,
      );
    }
  }
  // Bake the accumulated transform scale into stroke metrics so the
  // stored width matches the rendered (browser) width. Inheritance keeps
  // the specified value; scaling applies once at the leaf. Unstroked
  // elements need no scaling (and must not trigger anisotropy warnings).
  const swScale =
    stroke == null ? 1 : strokeWidthScale(mat, paint.spec.vectorEffect);
  const effStrokeWidth =
    strokeWidth != null ? strokeWidth * swScale : strokeWidth;
  // Fallbacks live in user units too (browser default width is 1).
  const swOr1 = effStrokeWidth ?? (stroke ? swScale : undefined);
  const swOr2 = effStrokeWidth ?? (stroke ? 2 * swScale : undefined);
  const effPaint: ResolvedPaint =
    swScale === 1
      ? paint
      : {
          ...paint,
          strokeDasharray: paint.strokeDasharray?.map((v) => v * swScale),
          strokeDashoffset:
            paint.strokeDashoffset != null
              ? paint.strokeDashoffset * swScale
              : paint.strokeDashoffset,
        };
  const baked: BakedPaintInput = { paint: effPaint, clipFrames: frames, opts: ctx.opts };

  if (tag === "g" || tag === "svg" || tag === "a") {
    for (const child of Array.from(el.children)) {
      collectFromElement(child, mat, nextInherited, out, ctx, frames);
    }
    return;
  }
  if (hidden) {
    logMsg(
      ctx,
      `skip visibility=${paint.spec.visibility} <${tag}> id=${attr(el, "id") ?? ""}`,
    );
    return;
  }

  if (tag === "path") {
    const d = attr(el, "d");
    if (!d) return;
    const { subpaths, closed } = pathDToSubpaths(d, mat);
    if (!subpaths.length) return;
    const primary = subpaths[0]!;
    const extras = subpaths.slice(1);
    const shape = makePathShape(
      primary,
      closed[0] ?? true,
      fill,
      stroke,
      swOr1,
      extras.length ? extras : undefined,
      baked,
    );
    if (shape) out.push(shape);
    return;
  }

  if (tag === "rect") {
    const x = num(attr(el, "x"));
    const y = num(attr(el, "y"));
    const w = num(attr(el, "width"));
    const h = num(attr(el, "height"));
    if (w <= 0 || h <= 0) return;
    const rx = Math.min(num(attr(el, "rx")), w / 2);
    const ry = Math.min(num(attr(el, "ry"), rx), h / 2);
    // Transform corners (ignore heavy rounded for matrix; sample if rx)
    const corners: Pt[] = [
      applyMatrix(mat, x, y),
      applyMatrix(mat, x + w, y),
      applyMatrix(mat, x + w, y + h),
      applyMatrix(mat, x, y + h),
    ];
    if (rx > 0 || ry > 0) {
      // Approximate rounded rect in local space then transform samples
      const pts: Pt[] = [];
      const steps = 4;
      const arcs: Array<[number, number, number, number]> = [
        [x + w - rx, y + ry, -Math.PI / 2, 0],
        [x + w - rx, y + h - ry, 0, Math.PI / 2],
        [x + rx, y + h - ry, Math.PI / 2, Math.PI],
        [x + rx, y + ry, Math.PI, (3 * Math.PI) / 2],
      ];
      for (const [cx, cy, a0, a1] of arcs) {
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const a = a0 + (a1 - a0) * t;
          pts.push(applyMatrix(mat, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
        }
      }
      const shape = makePathShape(pts, true, fill, stroke, swOr1, undefined, baked);
      if (shape) out.push(shape);
    } else {
      // Keep as rectangle if axis-aligned enough; else path
      const shape = makePathShape(corners, true, fill, stroke, swOr1, undefined, baked);
      if (shape) {
        // Prefer native rect when no rotation/skew in matrix
        if (
          Math.abs(mat.b) < 1e-6 &&
          Math.abs(mat.c) < 1e-6 &&
          mat.a > 0 &&
          mat.d > 0
        ) {
          const rcx = (corners[0]!.x + corners[2]!.x) / 2;
          const rcy = (corners[0]!.y + corners[2]!.y) / 2;
          const bbox: ShapeBBox = {
            minX: corners[0]!.x,
            minY: corners[0]!.y,
            maxX: corners[2]!.x,
            maxY: corners[2]!.y,
          };
          const final = finalizeShapePaint(paint, bbox, rcx, rcy, frames, ctx.opts);
          out.push({
            type: "shape",
            shapeType: "rectangle",
            localX: rcx,
            localY: rcy,
            width: w * mat.a,
            height: h * mat.d,
            fill,
            fillGradient: final.fillGradient,
            stroke,
            strokeWidth: swOr1,
            ...strokeProps(effPaint),
            fillRule: paint.fillRule,
            opacity: paint.opacity,
            clip: final.clip,
          });
        } else if (shape) {
          out.push(shape);
        }
      }
    }
    return;
  }

  if (tag === "circle") {
    const cx = num(attr(el, "cx"));
    const cy = num(attr(el, "cy"));
    const r = num(attr(el, "r"));
    if (r <= 0) return;
    if (
      Math.abs(mat.b) < 1e-6 &&
      Math.abs(mat.c) < 1e-6 &&
      Math.abs(mat.a - mat.d) < 1e-6
    ) {
      const c = applyMatrix(mat, cx, cy);
      const rr = r * Math.abs(mat.a);
      const final = finalizeShapePaint(
        effPaint,
        { minX: c.x - rr, minY: c.y - rr, maxX: c.x + rr, maxY: c.y + rr },
        c.x,
        c.y,
        frames,
        ctx.opts,
      );
      out.push({
        type: "shape",
        shapeType: "circle",
        localX: c.x,
        localY: c.y,
        radius: rr,
        fill,
        fillGradient: final.fillGradient,
        stroke,
        strokeWidth: swOr1,
        ...strokeProps(effPaint),
        fillRule: paint.fillRule,
        opacity: paint.opacity,
        clip: final.clip,
      });
    } else {
      const pts: Pt[] = [];
      const n = 32;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(applyMatrix(mat, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      const shape = makePathShape(pts, true, fill, stroke, swOr1, undefined, baked);
      if (shape) out.push(shape);
    }
    return;
  }

  if (tag === "ellipse") {
    const cx = num(attr(el, "cx"));
    const cy = num(attr(el, "cy"));
    const rx = num(attr(el, "rx"));
    const ry = num(attr(el, "ry"));
    if (rx <= 0 || ry <= 0) return;
    const pts: Pt[] = [];
    const n = 32;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(
        applyMatrix(mat, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry),
      );
    }
    const shape = makePathShape(pts, true, fill, stroke, swOr1, undefined, baked);
    if (shape) out.push(shape);
    return;
  }

  if (tag === "line") {
    const x1 = num(attr(el, "x1"));
    const y1 = num(attr(el, "y1"));
    const x2 = num(attr(el, "x2"));
    const y2 = num(attr(el, "y2"));
    const p1 = applyMatrix(mat, x1, y1);
    const p2 = applyMatrix(mat, x2, y2);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const final = finalizeShapePaint(
      effPaint,
      {
        minX: Math.min(p1.x, p2.x),
        minY: Math.min(p1.y, p2.y),
        maxX: Math.max(p1.x, p2.x),
        maxY: Math.max(p1.y, p2.y),
      },
      cx,
      cy,
      frames,
      ctx.opts,
    );
    out.push({
      type: "shape",
      shapeType: "line",
      localX: cx,
      localY: cy,
      points: [
        { x: p1.x - cx, y: p1.y - cy },
        { x: p2.x - cx, y: p2.y - cy },
      ],
      fill: undefined,
      // No stroke specified → SVG initial value is `none` (no implicit stroke).
      stroke,
      strokeWidth: swOr2,
      ...strokeProps(effPaint),
      opacity: paint.opacity,
      clip: final.clip,
    });
    return;
  }

  if (tag === "polyline" || tag === "polygon") {
    const raw = attr(el, "points") ?? "";
    const nums = raw
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter((n) => Number.isFinite(n));
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push(applyMatrix(mat, nums[i]!, nums[i + 1]!));
    }
    const shape = makePathShape(
      pts,
      tag === "polygon",
      fill,
      stroke,
      swOr1,
      undefined,
      baked,
    );
    if (shape) out.push(shape);
    return;
  }

  // Unknown: still walk children if any
  for (const child of Array.from(el.children)) {
    collectFromElement(child, mat, nextInherited, out, ctx, frames);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parseViewBox(
  svg: Element,
): { x: number; y: number; width: number; height: number } {
  const vb = attr(svg, "viewBox");
  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat);
    if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        x: parts[0]!,
        y: parts[1]!,
        width: parts[2]!,
        height: parts[3]!,
      };
    }
  }
  const width = num(attr(svg, "width"), 100);
  const height = num(attr(svg, "height"), 100);
  return { x: 0, y: 0, width, height };
}

/**
 * Parse an SVG document string into vector shapes usable by the editor.
 * Supports path / rect / circle / ellipse / line / polyline / polygon and
 * nested groups with basic transforms.
 */
export function parseSvgToShapes(
  svgText: string,
  options?: SvgParseOptions,
): SvgImportResult {
  const opts = options ?? {};
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVG の解析に失敗しました");
  }
  const svg =
    doc.querySelector("svg") ??
    (doc.documentElement?.tagName.toLowerCase() === "svg"
      ? doc.documentElement
      : null);
  if (!svg) {
    throw new Error("SVG ルート要素が見つかりません");
  }

  const viewBox = parseViewBox(svg);
  const shapes: SvgImportShape[] = [];
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const ctx: ImportCtx = {
    gradients: collectGradients(doc),
    styleRules: collectStyleRules(doc),
    clips: collectClipPaths(doc),
    patterns: collectPatternIds(doc),
    opts,
  };
  // Route warnings into collectLog as well (capped) for diagnostics.
  const log = opts.collectLog;
  const origWarn = console.warn;
  if (log) {
    console.warn = (msg?: unknown, ...rest: unknown[]) => {
      if (log.length < 500) log.push(String(msg ?? ""));
      origWarn(msg, ...rest);
    };
  }
  try {
    collectFromElement(svg, identity, ROOT_INHERITED, shapes, ctx);
  } finally {
    if (log) console.warn = origWarn;
  }

  return {
    width: viewBox.width || 100,
    height: viewBox.height || 100,
    viewBox,
    shapes,
    hasVectors: shapes.length > 0,
  };
}

/** Read SVG file text (handles UTF-8). */
export async function readSvgText(file: File): Promise<string> {
  return file.text();
}

/**
 * Convert parsed import shapes into full ShapeElements centered at (cx, cy).
 * `offset` shifts by the SVG viewBox origin so content lands on stage correctly.
 */
export function materializeSvgShapes(
  result: SvgImportResult,
  cx: number,
  cy: number,
): ShapeElement[] {
  const ox = result.viewBox.x + result.viewBox.width / 2;
  const oy = result.viewBox.y + result.viewBox.height / 2;
  return result.shapes.map((s) => {
    const { localX, localY, opacity, ...rest } = s;
    return {
      ...rest,
      id: generateId("shape"),
      x: cx + (localX - ox),
      y: cy + (localY - oy),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: opacity ?? 1,
    } as ShapeElement;
  });
}

export function isSvgFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/svg+xml" ||
    name.endsWith(".svg") ||
    file.type === "text/xml" && name.endsWith(".svg")
  );
}
