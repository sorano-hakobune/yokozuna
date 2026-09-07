import React from "react";
import type { Layer, Project } from "@/types/project";
import { groupsInPaintOrder } from "@/lib/layers";
import { renderLayerElements } from "./LayerContent";
import {
  buildOnionSkinFrames,
  type OnionSkinFrame,
} from "@/lib/animation/onionSkin";

type Props = {
  layers: Layer[];
  project: Project;
  currentFrame: number;
  duration: number;
  enabled: boolean;
  before: number;
  after: number;
  width: number;
  height: number;
};

/**
 * Ghost frames behind the live stage content.
 * Past = cool blue wash, future = warm green wash (via translucent overlay).
 */
export function OnionSkinLayers({
  layers,
  project,
  currentFrame,
  duration,
  enabled,
  before,
  after,
  width,
  height,
}: Props) {
  if (!enabled || before + after === 0) return null;

  const ghosts = buildOnionSkinFrames(currentFrame, duration, before, after);
  if (ghosts.length === 0) return null;

  return (
    <g className="onion-skin" pointerEvents="none">
      {ghosts.map((ghost) => (
        <OnionGhost
          key={`onion-${ghost.side}-${ghost.frame}`}
          ghost={ghost}
          layers={layers}
          project={project}
          width={width}
          height={height}
        />
      ))}
    </g>
  );
}

function OnionGhost({
  ghost,
  layers,
  project,
  width,
  height,
}: {
  ghost: OnionSkinFrame;
  layers: Layer[];
  project: Project;
  width: number;
  height: number;
}) {
  const tint =
    ghost.side === "past"
      ? "rgba(59, 130, 246, 0.12)"
      : "rgba(34, 197, 94, 0.10)";

  return (
    <g className={`onion-ghost onion-${ghost.side}`} opacity={ghost.opacity}>
      {renderFrameContent(layers, project, ghost.frame, width, height)}
      {/* Soft color cue without recoloring every shape */}
      <rect
        width={width}
        height={height}
        fill={tint}
        style={{ mixBlendMode: "multiply" }}
      />
    </g>
  );
}

/** Paint layers at an arbitrary frame (masks applied; no mask authoring overlay). */
function renderFrameContent(
  layers: Layer[],
  project: Project,
  frame: number,
  width: number,
  height: number,
): React.ReactNode {
  return groupsInPaintOrder(layers).map((group) => {
    if (group.kind === "guide") {
      // Guides are authoring-only — skip in onion ghosts
      return null;
    }
    if (group.kind === "normal") {
      return (
        <g key={`onion-n-${frame}-${group.layers.map((l) => l.id).join("-")}`}>
          {[...group.layers].reverse().map((layer) => {
            if (!layer.visible) return null;
            return (
              <g key={layer.id}>
                {renderLayerElements(layer, project, frame, "normal")}
              </g>
            );
          })}
        </g>
      );
    }
    const { mask, masked } = group;
    const maskId = `yo-onion-mask-${mask.id}-${frame}`;
    return (
      <g key={`onion-m-${frame}-${mask.id}`}>
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <rect width={width} height={height} fill="#000000" />
            {mask.visible &&
              renderLayerElements(mask, project, frame, "mask")}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {[...masked].reverse().map((layer) => {
            if (!layer.visible) return null;
            return (
              <g key={layer.id}>
                {renderLayerElements(layer, project, frame, "normal")}
              </g>
            );
          })}
        </g>
      </g>
    );
  });
}
