import { useProjectStore } from "@/stores/projectStore";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import {
  isEditablePathShape,
} from "@/lib/selection/pathEdit";
import type { VertexSession } from "../types/stageSession";
import {
  resolveSelection,
  unionSelectionBounds,
} from "@/lib/selection/selectionBounds";
import type { Layer, Project, ToolType } from "@/types/project";
import { GroupTransformControls } from "../GroupTransformControls";
import { MarqueeRect } from "../SelectionOverlay";
import {
  MotionPathOverlay,
  moveMotionPathHandle,
  moveMotionPathPoint,
} from "../MotionPathOverlay";
import { PathVertexControls } from "../PathVertexControls";
import { TransformControls } from "../TransformControls";
import type { HandleId } from "../transformGeometry";

type SelectionOverlaysProps = {
  layers: Layer[];
  project: Project;
  currentFrame: number;
  selectedTool: ToolType;
  selectedLayerId: string | undefined;
  selectedElementId: string | undefined;
  selectedElementIds: string[];
  canvasZoom: number;
  pathEditMode: boolean;
  activeHandle: HandleId | null;
  hoverHandle: HandleId | null;
  marqueeUi: { x0: number; y0: number; x1: number; y1: number } | null;
  selectedVertexIndex: number | null;
  vertexSession: VertexSession | null;
};

/** Group/marquee/vertex/single-transform/motion-path overlays (pure render). */
export function SelectionOverlays(p: SelectionOverlaysProps) {
  return (
    <>
      {p.selectedTool === "select" &&
        p.selectedElementIds.length > 1 &&
        (() => {
          const items = resolveSelection(
            p.layers,
            p.currentFrame,
            p.selectedElementIds,
            p.project,
          );
          const union = unionSelectionBounds(items, p.project);
          if (!union) return null;
          return (
            <GroupTransformControls
              key="sel-group"
              bounds={union}
              zoom={p.canvasZoom}
              count={items.length}
              activeHandle={p.activeHandle}
            />
          );
        })()}
      {p.marqueeUi && (
        <MarqueeRect
          x0={p.marqueeUi.x0}
          y0={p.marqueeUi.y0}
          x1={p.marqueeUi.x1}
          y1={p.marqueeUi.y1}
          zoom={p.canvasZoom}
        />
      )}
      {p.selectedTool === "select" &&
        p.pathEditMode &&
        p.selectedElementIds.length === 1 &&
        p.selectedElementId &&
        (() => {
          const items = resolveSelection(
            p.layers,
            p.currentFrame,
            p.selectedElementIds,
            p.project,
          );
          const el = items[0]?.element;
          if (!el || !isEditablePathShape(el)) return null;
          return (
            <PathVertexControls
              key="path-verts"
              shape={el}
              zoom={p.canvasZoom}
              selectedIndex={p.selectedVertexIndex}
              activeIndex={p.vertexSession?.index}
            />
          );
        })()}
      {p.selectedTool === "select" &&
        p.selectedElementIds.length === 1 &&
        p.selectedElementId &&
        (() => {
          for (const layer of p.layers) {
            if (!layer.visible) continue;
            const el = getElementsAtFrame(
              layer.keyframes,
              p.currentFrame,
            ).find((item) => item.id === p.selectedElementId);
            if (!el) continue;
            const asset =
              el.type === "bitmap"
                ? p.project.assets[el.assetId]
                : el.type === "instance"
                  ? p.project.symbols[el.symbolId]
                  : undefined;
            return (
              <TransformControls
                key={`xf-${el.id}`}
                element={el}
                asset={asset}
                zoom={p.canvasZoom}
                activeHandle={p.activeHandle}
              />
            );
          }
          return null;
        })()}
      {(() => {
        // Motion path for the active layer keyframe span covering currentFrame
        const layer = p.layers.find((l) => l.id === p.selectedLayerId);
        if (!layer) return null;
        const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame);
        let kf = sorted.find((k, i) => {
          const next = sorted[i + 1];
          if (!next) return false;
          return (
            k.tween === "motion" &&
            k.motionPath &&
            p.currentFrame >= k.frame &&
            p.currentFrame <= next.frame
          );
        });
        // Also show on exact start keyframe
        if (!kf) {
          kf = sorted.find(
            (k) =>
              k.frame === p.currentFrame &&
              k.tween === "motion" &&
              k.motionPath,
          );
        }
        if (!kf?.motionPath) return null;
        return (
          <MotionPathOverlay
            key={`mp-${kf.frame}`}
            path={kf.motionPath}
            zoom={p.canvasZoom}
            onMovePoint={(index, x, y) => {
              const pts = moveMotionPathPoint(
                kf!.motionPath!.points,
                index,
                x,
                y,
              );
              useProjectStore.getState().setKeyframeMotionPath(
                layer.id,
                kf!.frame,
                { ...kf!.motionPath!, points: pts },
              );
            }}
            onMoveHandle={(index, which, x, y) => {
              const pts = moveMotionPathHandle(
                kf!.motionPath!.points,
                index,
                which,
                x,
                y,
              );
              useProjectStore.getState().setKeyframeMotionPath(
                layer.id,
                kf!.frame,
                { ...kf!.motionPath!, points: pts },
              );
            }}
          />
        );
      })()}
    </>
  );
}
