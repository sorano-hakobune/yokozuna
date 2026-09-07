export * from "./shapeRenderer";
export * from "./shapeFactory";
export * from "./erasePath";
export * from "./pathSimplify";
export * from "./pathBezier";

export { createTextShape } from "./shapeFactory";
export * from "./gradient";
export * from "./fillRegion";
// fillRegion and pathBezier both define `Pt` (identical shape);
// an explicit re-export wins over the star-export ambiguity (TS2308).
export type { Pt } from "./pathBezier";
