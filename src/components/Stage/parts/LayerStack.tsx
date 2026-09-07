import { groupsInPaintOrder } from "@/lib/layers";
import type { Layer, Project } from "@/types/project";
import { renderLayerElements } from "../LayerContent";
import { OnionSkinLayers } from "../OnionSkinLayers";

type LayerStackProps = {
  layers: Layer[];
  project: Project;
  currentFrame: number;
  compositionDuration: number;
  onionSkinEnabled: boolean;
  onionSkinBefore: number;
  onionSkinAfter: number;
  stageWidth: number;
  stageHeight: number;
  selectedLayerId: string | undefined;
};

/** Paint-order layer stack incl. onion skin, masks and guides. */
export function LayerStack(p: LayerStackProps) {
  return (
    <g key={p.layers.map((l) => l.id).join("|")}>
      <OnionSkinLayers
        layers={p.layers}
        project={p.project}
        currentFrame={p.currentFrame}
        duration={p.compositionDuration}
        enabled={p.onionSkinEnabled}
        before={p.onionSkinBefore}
        after={p.onionSkinAfter}
        width={p.stageWidth}
        height={p.stageHeight}
      />
      {groupsInPaintOrder(p.layers).map((group) => {
        if (group.kind === "guide") {
          if (!group.layer.visible) return null;
          return (
            <g
              key={`guide-${group.layer.id}`}
              className="layer-guide"
              opacity={0.85}
            >
              {renderLayerElements(
                group.layer,
                p.project,
                p.currentFrame,
                "guide",
              )}
            </g>
          );
        }
        if (group.kind === "normal") {
          // group.layers is top→bottom. SVG paints later siblings on top →
          // reverse so front layer draws last.
          const paintList = [...group.layers].reverse();
          return (
            <g key={`normal-${group.layers.map((l) => l.id).join("-")}`}>
              {paintList.map((layer, paintIndex) => {
                if (!layer.visible) return null;
                return (
                  <g
                    key={layer.id}
                    data-layer-id={layer.id}
                    data-paint-index={paintIndex}
                  >
                    {renderLayerElements(
                      layer,
                      p.project,
                      p.currentFrame,
                      "normal",
                    )}
                  </g>
                );
              })}
            </g>
          );
        }
        // mask group
        const { mask, masked } = group;
        const maskId = `yo-mask-${mask.id}`;
        const showMaskOverlay =
          p.selectedLayerId === mask.id ||
          masked.some((l) => l.id === p.selectedLayerId);
        return (
          <g key={`mask-group-${mask.id}`}>
            <defs>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={p.stageWidth}
                height={p.stageHeight}
              >
                <rect
                  width={p.stageWidth}
                  height={p.stageHeight}
                  fill="#000000"
                />
                {mask.visible &&
                  renderLayerElements(
                    mask,
                    p.project,
                    p.currentFrame,
                    "mask",
                  )}
              </mask>
            </defs>
            <g mask={`url(#${maskId})`}>
              {[...masked].reverse().map((layer) => {
                if (!layer.visible) return null;
                return (
                  <g key={layer.id}>
                    {renderLayerElements(
                      layer,
                      p.project,
                      p.currentFrame,
                      "normal",
                    )}
                  </g>
                );
              })}
            </g>
            {/* Authoring overlay: show mask shapes when relevant */}
            {mask.visible && showMaskOverlay && (
              <g className="mask-overlay" pointerEvents="none">
                {renderLayerElements(
                  mask,
                  p.project,
                  p.currentFrame,
                  "mask-overlay",
                )}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
