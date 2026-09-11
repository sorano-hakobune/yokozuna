import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() }).passthrough();
const pathPointSchema = pointSchema.extend({
  handleIn: pointSchema.optional(),
  handleOut: pointSchema.optional(),
  smooth: z.boolean().optional(),
});
const transformSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
    rotation: z.number(),
    opacity: z.number(),
    pivot: pointSchema.optional(),
  })
  .passthrough();
const filterSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("blur"), amount: z.number() }),
  z.object({
    type: z.literal("dropShadow"),
    dx: z.number(),
    dy: z.number(),
    blur: z.number(),
    color: z.string(),
    opacity: z.number(),
  }),
  z.object({
    type: z.literal("glow"),
    amount: z.number(),
    color: z.string(),
    opacity: z.number(),
  }),
  z.object({ type: z.literal("brightness"), amount: z.number() }),
  z.object({ type: z.literal("contrast"), amount: z.number() }),
  z.object({ type: z.literal("saturate"), amount: z.number() }),
  z.object({ type: z.literal("hueRotate"), degrees: z.number() }).passthrough(),
]);

const elementSchema = transformSchema
  .extend({
    id: z.string(),
    type: z.enum(["instance", "bitmap", "shape"]),
    name: z.string().optional(),
    filters: z.array(filterSchema).optional(),
    symbolId: z.string().optional(),
    assetId: z.string().optional(),
    shapeType: z.enum(["rectangle", "circle", "line", "path", "text"]).optional(),
    fill: z.string().optional(),
    fillGradient: z
      .object({
        type: z.enum(["linear", "radial"]),
        x1: z.number().optional(),
        y1: z.number().optional(),
        x2: z.number().optional(),
        y2: z.number().optional(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        r: z.number().optional(),
        stops: z.array(z.object({ offset: z.number(), color: z.string() })),
      })
      .optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeLinecap: z.enum(["butt", "round", "square"]).optional(),
    strokeLinejoin: z.enum(["miter", "round", "bevel"]).optional(),
    strokeMiterlimit: z.number().optional(),
    strokeDasharray: z.array(z.number()).optional(),
    strokeDashoffset: z.number().optional(),
    clip: z
      .array(z.object({ paths: z.array(z.array(pathPointSchema)) }))
      .optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    radius: z.number().optional(),
    points: z.array(pathPointSchema).optional(),
    subpaths: z.array(z.array(pathPointSchema)).optional(),
    fillRule: z.enum(["nonzero", "evenodd"]).optional(),
    closePath: z.boolean().optional(),
    cornerRadius: z.number().optional(),
    text: z.string().optional(),
    textOrientation: z.enum(["horizontal", "vertical"]).optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
  })
  .passthrough();

const keyframeSchema = z
  .object({
    frame: z.number(),
    tween: z.enum(["none", "motion", "shape"]),
    easing: z
      .enum([
        "linear", "easeIn", "easeOut", "easeInOut",
        "easeInQuad", "easeOutQuad", "easeInOutQuad",
        "easeInCubic", "easeOutCubic", "easeInOutCubic",
        "easeInQuart", "easeOutQuart", "easeInOutQuart",
        "easeInQuint", "easeOutQuint", "easeInOutQuint",
        "easeInSine", "easeOutSine", "easeInOutSine",
        "easeInExpo", "easeOutExpo", "easeInOutExpo",
        "easeInCirc", "easeOutCirc", "easeInOutCirc",
        "easeInBack", "easeOutBack", "easeInOutBack",
        "easeInElastic", "easeOutElastic", "easeInOutElastic",
        "easeInBounce", "easeOutBounce", "easeInOutBounce",
        "custom",
      ])
      .optional(),
    easingBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    elements: z.array(elementSchema),
    motionPath: z
      .object({
        points: z.array(z.object({ ...pathPointSchema.shape })),
        orientToPath: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const layerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["normal", "mask", "guide", "folder"]),
    visible: z.boolean(),
    locked: z.boolean(),
    keyframes: z.array(keyframeSchema),
    parentId: z.string().optional(),
    expanded: z.boolean().optional(),
  })
  .passthrough();

const assetSchema = z
  .object({
    id: z.string(),
    type: z.enum(["image", "audio", "svg"]),
    name: z.string(),
    src: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    mimeType: z.string().optional(),
    duration: z.number().optional(),
  })
  .passthrough();

const soundSchema = z
  .object({
    id: z.string(),
    assetId: z.string(),
    startFrame: z.number(),
    durationFrames: z.number(),
    volume: z.number(),
    muted: z.boolean().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const compositionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    duration: z.number(),
    layers: z.array(layerSchema),
    labels: z
      .array(
        z.object({
          id: z.string(),
          frame: z.number(),
          name: z.string(),
          color: z.string().optional(),
        }),
      )
      .optional(),
    sounds: z.array(soundSchema).optional(),
  })
  .passthrough();

export const projectSchema = z
  .object({
    version: z.string(),
    meta: z.object({
      name: z.string(),
      createdAt: z.string(),
      modifiedAt: z.string(),
      author: z.string().optional(),
    }),
    settings: z.object({
      width: z.number(),
      height: z.number(),
      fps: z.number(),
      backgroundColor: z.string(),
      duration: z.number(),
      gridSize: z.number().optional(),
      showGrid: z.boolean().optional(),
      snapToGrid: z.boolean().optional(),
      showGuides: z.boolean().optional(),
      snapToGuides: z.boolean().optional(),
      guides: z
        .array(
          z.object({
            id: z.string(),
            orientation: z.enum(["horizontal", "vertical"]),
            position: z.number(),
          }),
        )
        .optional(),
    }),
    assets: z.record(z.string(), assetSchema),
    symbols: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          type: z.enum(["graphic", "movieClip"]),
          width: z.number(),
          height: z.number(),
          pivot: pointSchema,
          duration: z.number(),
          layers: z.array(layerSchema),
        })
        .passthrough(),
    ),
    compositions: z.record(z.string(), compositionSchema),
    activeCompositionId: z.string(),
  })
  .passthrough();

export type ProjectSchemaInput = z.input<typeof projectSchema>;

export const CURRENT_PROJECT_VERSION = "1.0.0";

export function migrateProjectData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const project = value as Record<string, unknown>;
  const compositions =
    project.compositions && typeof project.compositions === "object"
      ? Object.fromEntries(
          Object.entries(project.compositions as Record<string, unknown>).map(
            ([id, rawComposition]) => {
              if (!rawComposition || typeof rawComposition !== "object") {
                return [id, rawComposition];
              }
              const composition = rawComposition as Record<string, unknown>;
              const layers = Array.isArray(composition.layers)
                ? composition.layers.map((rawLayer) => {
                    if (!rawLayer || typeof rawLayer !== "object") return rawLayer;
                    const layer = rawLayer as Record<string, unknown>;
                    return {
                      ...layer,
                      type: layer.type ?? "normal",
                      visible: layer.visible ?? true,
                      locked: layer.locked ?? false,
                      keyframes: Array.isArray(layer.keyframes)
                        ? layer.keyframes
                        : [{ frame: 0, tween: "none", elements: [] }],
                    };
                  })
                : [];
              return [id, { ...composition, layers }];
            },
          ),
        )
      : project.compositions;
  return { ...project, version: CURRENT_PROJECT_VERSION, compositions };
}
