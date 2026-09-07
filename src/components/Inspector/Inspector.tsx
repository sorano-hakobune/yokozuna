import { useRef } from "react";
import { useInspectorModel } from "./hooks/useInspectorModel";
import { DocumentSection } from "./parts/DocumentSection";
import { LayerSection } from "./parts/LayerSection";
import {
  TweenSection,
  NoKeyframeNotice,
  MultiSelectionSummary,
} from "./parts/TweenSection";
import { TransformFields, elementTypeLabel } from "./parts/TransformFields";
import { FilterSection } from "./parts/FilterSection";
import { TextFields, SizeFields } from "./parts/TextSizeFields";
import { PathEditor } from "./parts/PathEditor";
import { FillSection, StrokeFields } from "./parts/FillStroke";
import { SettingsDialog } from "./parts/SettingsDialog";

export function Inspector() {
  const m = useInspectorModel();
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const showDocument =
    !m.selectedElementId && m.selectedElementIds.length === 0;

  return (
    <aside className="prop-inspector prop-inspector--sidebar">
      <div className="inspector-heading">
        <span>プロパティ</span>
      </div>
      <div className="prop-body prop-body--vertical">
        {showDocument && (
          <DocumentSection m={m} dialogRef={settingsDialogRef} />
        )}

        <LayerSection m={m} />

        <TweenSection m={m} />
        <NoKeyframeNotice m={m} />
        <MultiSelectionSummary m={m} />

        {m.selectedElementIds.length <= 1 && m.selectedElement && (
          <div className="prop-group">
            <div className="prop-label">{elementTypeLabel(m)}</div>
            <TransformFields m={m} />
            <FilterSection m={m} />
            <TextFields m={m} />
            <SizeFields m={m} />
            <PathEditor m={m} />
            <FillSection m={m} />
            <StrokeFields m={m} />
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                if (m.selectedElementId && m.activeLayer) {
                  m.removeElement(
                    m.activeLayer.id,
                    m.currentFrame,
                    m.selectedElementId,
                  );
                }
              }}
            >
              削除
            </button>
          </div>
        )}
      </div>

      <SettingsDialog m={m} dialogRef={settingsDialogRef} />
    </aside>
  );
}
