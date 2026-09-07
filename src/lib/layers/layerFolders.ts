import type { Layer } from "@/types/project";

export function isFolderLayer(layer: Layer | null | undefined): boolean {
  return !!layer && layer.type === "folder";
}

/** Content layers (skip folders) in paint / timeline logic that needs keyframes. */
export function contentLayers(layers: Layer[]): Layer[] {
  return layers.filter((l) => l.type !== "folder");
}

/** Direct children of a folder (or root when parentId is undefined). */
export function getDirectChildren(
  layers: Layer[],
  parentId: string | undefined,
): Layer[] {
  return layers.filter((l) => (l.parentId ?? undefined) === parentId);
}

/** All descendant layer ids under a folder (recursive). */
export function getDescendantIds(layers: Layer[], folderId: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const l of layers) {
      if (l.parentId === pid) {
        out.push(l.id);
        if (l.type === "folder") walk(l.id);
      }
    }
  };
  walk(folderId);
  return out;
}

/** Depth from root (0 = root). Detects cycles. */
export function getLayerDepth(layers: Layer[], layerId: string): number {
  const map = new Map(layers.map((l) => [l.id, l]));
  let depth = 0;
  let cur = map.get(layerId);
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const parent = map.get(cur.parentId);
    if (!parent) break;
    depth += 1;
    cur = parent;
    if (depth > 32) break;
  }
  return depth;
}

/**
 * Layers visible in the timeline list (hide children of collapsed folders).
 * Order matches `layers` array.
 */
export function getTimelineVisibleLayers(layers: Layer[]): Layer[] {
  const collapsed = new Set<string>();
  for (const l of layers) {
    if (l.type === "folder" && l.expanded === false) {
      collapsed.add(l.id);
    }
  }
  // Any ancestor collapsed → hide
  const isHidden = (layer: Layer): boolean => {
    let pid = layer.parentId;
    const seen = new Set<string>();
    while (pid) {
      if (collapsed.has(pid)) return true;
      if (seen.has(pid)) break;
      seen.add(pid);
      const p = layers.find((x) => x.id === pid);
      pid = p?.parentId;
    }
    return false;
  };
  return layers.filter((l) => !isHidden(l));
}

/**
 * Effective visibility: layer is shown only if itself and all ancestor folders are visible.
 */
export function isEffectivelyVisible(layers: Layer[], layerId: string): boolean {
  const map = new Map(layers.map((l) => [l.id, l]));
  let cur = map.get(layerId);
  const seen = new Set<string>();
  while (cur) {
    if (!cur.visible) return false;
    if (!cur.parentId) return true;
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = map.get(cur.parentId);
  }
  return true;
}

/**
 * Effective lock: locked if self or any ancestor folder is locked.
 */
export function isEffectivelyLocked(layers: Layer[], layerId: string): boolean {
  const map = new Map(layers.map((l) => [l.id, l]));
  let cur = map.get(layerId);
  const seen = new Set<string>();
  while (cur) {
    if (cur.locked) return true;
    if (!cur.parentId) return false;
    if (seen.has(cur.id)) return false;
    seen.add(cur.id);
    cur = map.get(cur.parentId);
  }
  return false;
}

/**
 * After changing a folder's visible/locked, optionally cascade to descendants.
 * Returns a new layers array.
 */
export function cascadeFolderFlags(
  layers: Layer[],
  folderId: string,
  partial: { visible?: boolean; locked?: boolean },
): Layer[] {
  const ids = new Set(getDescendantIds(layers, folderId));
  ids.add(folderId);
  return layers.map((l) => {
    if (!ids.has(l.id)) return l;
    return {
      ...l,
      ...(partial.visible !== undefined ? { visible: partial.visible } : {}),
      ...(partial.locked !== undefined ? { locked: partial.locked } : {}),
    };
  });
}

/**
 * Place `layerId` as the last child of `folderId` (or root if undefined).
 * Reorders the flat array so folder children stay contiguous after the folder.
 */
export function reparentLayer(
  layers: Layer[],
  layerId: string,
  folderId: string | undefined,
): Layer[] {
  if (layerId === folderId) return layers;
  const map = new Map(layers.map((l) => [l.id, l]));
  const layer = map.get(layerId);
  if (!layer) return layers;
  if (folderId) {
    const folder = map.get(folderId);
    if (!folder || folder.type !== "folder") return layers;
    // Prevent parenting under own descendant
    if (getDescendantIds(layers, layerId).includes(folderId)) return layers;
  }

  // Remove layer and its descendants as a block
  const blockIds = new Set([layerId, ...getDescendantIds(layers, layerId)]);
  const block = layers.filter((l) => blockIds.has(l.id));
  const rest = layers.filter((l) => !blockIds.has(l.id));

  // Update parent on the moved root of the block
  const moved = block.map((l) =>
    l.id === layerId
      ? { ...l, parentId: folderId || undefined }
      : { ...l },
  );

  if (!folderId) {
    // Append to root end
    return [...rest, ...moved];
  }

  // Insert after folder and its current descendants in `rest`
  const folderIdx = rest.findIndex((l) => l.id === folderId);
  if (folderIdx < 0) return [...rest, ...moved];

  // Find end of folder's remaining children block
  let insertAt = folderIdx + 1;
  while (insertAt < rest.length) {
    const l = rest[insertAt]!;
    // still under this folder tree?
    let under = false;
    let pid = l.parentId;
    const seen = new Set<string>();
    while (pid) {
      if (pid === folderId) {
        under = true;
        break;
      }
      if (seen.has(pid)) break;
      seen.add(pid);
      pid = rest.find((x) => x.id === pid)?.parentId;
    }
    if (!under) break;
    insertAt += 1;
  }

  const next = [
    ...rest.slice(0, insertAt),
    ...moved,
    ...rest.slice(insertAt),
  ];
  return next;
}

/** Ensure parentId references exist; clear broken links. */
export function sanitizeLayerParents(layers: Layer[]): Layer[] {
  const ids = new Set(layers.map((l) => l.id));
  return layers.map((l) => {
    if (l.parentId && !ids.has(l.parentId)) {
      const { parentId: _p, ...rest } = l;
      return rest as Layer;
    }
    if (l.parentId && layers.find((x) => x.id === l.parentId)?.type !== "folder") {
      const { parentId: _p, ...rest } = l;
      return rest as Layer;
    }
    return l;
  });
}
