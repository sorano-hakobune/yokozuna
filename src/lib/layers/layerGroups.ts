import type { Layer, LayerType } from "@/types/project";

/**
 * Timeline list order: index 0 = top (front).
 *
 * Flash-style rules:
 * - `mask` layer masks the following consecutive `normal` layers
 * - `guide` is authoring-only (drawn specially, not as final content)
 * - other `normal` runs are regular content
 */
export type LayerRenderGroup =
  | { kind: "normal"; layers: Layer[] }
  | { kind: "mask"; mask: Layer; masked: Layer[] }
  | { kind: "guide"; layer: Layer };

/** Partition timeline layers (top → bottom) into render groups. Folders are skipped. */
export function groupLayersForRender(layers: Layer[]): LayerRenderGroup[] {
  // Folders are organizational only — paint uses content layers in array order
  const content = layers.filter((l) => l.type !== "folder");
  const groups: LayerRenderGroup[] = [];
  let i = 0;
  while (i < content.length) {
    const layer = content[i]!;
    if (layer.type === "guide") {
      groups.push({ kind: "guide", layer });
      i += 1;
      continue;
    }
    if (layer.type === "mask") {
      const mask = layer;
      i += 1;
      const masked: Layer[] = [];
      while (i < content.length && content[i]!.type === "normal") {
        masked.push(content[i]!);
        i += 1;
      }
      groups.push({ kind: "mask", mask, masked });
      continue;
    }
    // normal (and any unknown) — pack consecutive normals
    const pack: Layer[] = [layer];
    i += 1;
    while (i < content.length && content[i]!.type === "normal") {
      pack.push(content[i]!);
      i += 1;
    }
    groups.push({ kind: "normal", layers: pack });
  }
  return groups;
}

/** Groups in paint order (back → front). */
export function groupsInPaintOrder(layers: Layer[]): LayerRenderGroup[] {
  return groupLayersForRender(layers).slice().reverse();
}

export function cycleLayerType(current: LayerType): LayerType {
  // Folders stay folders
  if (current === "folder") return "folder";
  if (current === "normal") return "mask";
  if (current === "mask") return "guide";
  return "normal";
}

export function layerTypeLabel(type: LayerType): string {
  switch (type) {
    case "mask":
      return "マスク";
    case "guide":
      return "ガイド";
    case "folder":
      return "フォルダ";
    default:
      return "通常";
  }
}

/** True if this normal layer is under a mask in the timeline stack. */
export function isLayerMasked(layers: Layer[], layerId: string): boolean {
  for (const group of groupLayersForRender(layers)) {
    if (group.kind === "mask" && group.masked.some((l) => l.id === layerId)) {
      return true;
    }
  }
  return false;
}
