import { useProjectStore } from "@/stores/projectStore";
import { useSelectedLayer } from "@/stores/projectSelectors";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { toHex6 } from "@/lib/color";
import type {
  ElementFilter,
  GradientFill,
  PathPoint,
  ShapeElement,
} from "@/types/project";

/** Centralizes Inspector store subscriptions + derived model + guarded updaters. */
export function useInspectorModel() {
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const selectedElementIds = useProjectStore((s) => s.selectedElementIds);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const updateElement = useProjectStore((s) => s.updateElement);
  const removeElement = useProjectStore((s) => s.removeElement);
  const setKeyframeTween = useProjectStore((s) => s.setKeyframeTween);
  const setKeyframeMotionPath = useProjectStore((s) => s.setKeyframeMotionPath);
  const settings = useProjectStore((s) => s.project.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const pathEditMode = useProjectStore((s) => s.pathEditMode);
  const setPathEditMode = useProjectStore((s) => s.setPathEditMode);
  const activeLayer = useSelectedLayer();

  const elements = activeLayer
    ? getElementsAtFrame(activeLayer.keyframes, currentFrame)
    : [];
  const selectedElement = elements.find(
    (el) => el.id === selectedElementId,
  ) as ShapeElement | undefined;

  const currentKeyframe = activeLayer?.keyframes.find(
    (kf) => kf.frame === currentFrame,
  );
  const sortedKeyframes = activeLayer
    ? [...activeLayer.keyframes].sort((a, b) => a.frame - b.frame)
    : [];
  const currentKfIndex = currentKeyframe
    ? sortedKeyframes.findIndex((kf) => kf.frame === currentFrame)
    : -1;
  const hasNextKeyframe =
    currentKfIndex >= 0 && currentKfIndex < sortedKeyframes.length - 1;

  const handleElementPropertyChange = (
    key: string,
    value: number | string | GradientFill | PathPoint[] | undefined,
  ) => {
    if (!selectedElementId || !activeLayer) return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return;
      if (key === "opacity") value = Math.max(0, Math.min(1, value));
      if (
        ["scaleX", "scaleY", "width", "height", "radius", "cornerRadius", "strokeWidth"].includes(key)
      ) {
        value = Math.max(0.01, value);
      }
    }
    if ((key === "fill" || key === "stroke") && typeof value === "string") {
      value = toHex6(value, key === "fill" ? "#0066cc" : "#111111");
    }
    updateElement(activeLayer.id, currentFrame, selectedElementId, {
      [key]: value,
    } as Partial<ShapeElement>);
  };

  const setElementFilters = (filters: ElementFilter[]) => {
    if (!selectedElementId || !activeLayer) return;
    updateElement(activeLayer.id, currentFrame, selectedElementId, {
      filters: filters.length ? filters : undefined,
    });
  };

  return {
    currentFrame,
    selectedElementId,
    selectedElementIds,
    activeLayer,
    elements,
    selectedElement,
    currentKeyframe,
    sortedKeyframes,
    currentKfIndex,
    hasNextKeyframe,
    settings,
    pathEditMode,
    updateLayer,
    updateElement,
    removeElement,
    setKeyframeTween,
    setKeyframeMotionPath,
    updateSettings,
    setPathEditMode,
    handleElementPropertyChange,
    setElementFilters,
  };
}

export type InspectorModel = ReturnType<typeof useInspectorModel>;
