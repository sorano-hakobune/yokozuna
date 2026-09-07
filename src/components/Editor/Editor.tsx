import { useEffect, useRef, useState } from "react";
import { MenuBar } from "@/components/MenuBar/MenuBar";
import { ToolsPanel } from "@/components/ToolsPanel/ToolsPanel";
import { Timeline } from "@/components/Timeline";
import { Stage } from "@/components/Stage";
import { Inspector } from "@/components/Inspector";
import { ColorPanel } from "@/components/Panels/ColorPanel";
import { LibraryPanel } from "@/components/Panels/LibraryPanel";
import { useProjectStore } from "@/stores/projectStore";
import { loadAutosave, projectFingerprint } from "@/lib/project/persistence";
import { useAutosave } from "@/hooks/useAutosave";
import { useActiveLayers } from "@/stores/projectSelectors";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { StageStatusBar } from "./parts/StageStatusBar";
import { EditTargetBar } from "./parts/EditTargetBar";
import { StageZoomControls } from "./parts/StageZoomControls";
import { OnboardingHint } from "./parts/OnboardingHint";
import "@/components/Timeline/timeline.css";
import "@/styles/editor.css";

type RightTab = "properties" | "color" | "library";

const ONBOARDING_KEY = "yokozuna-onboarding-dismissed";

export function Editor() {
  const activeLayers = useActiveLayers();
  const [timelineHeight, setTimelineHeight] = useState(
    Math.max(160, 100 + activeLayers.length * 24),
  );
  const [rightDockOpen, setRightDockOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("properties");
  const resizing = useRef<"timeline" | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const project = useProjectStore((s) => s.project);
  const composition = project.compositions[project.activeCompositionId];
  const editingSymbolId = useProjectStore((s) => s.editingSymbolId);
  const exitSymbolEdit = useProjectStore((s) => s.exitSymbolEdit);
  const editingSymbol = editingSymbolId
    ? project.symbols[editingSymbolId]
    : undefined;

  useEditorShortcuts();
  useAutosave();

  // Offer to restore autosave draft once on launch
  useEffect(() => {
    const draft = loadAutosave();
    if (!draft?.project) return;
    const current = useProjectStore.getState().project;
    // Skip if same fingerprint (already restored / empty match)
    if (projectFingerprint(draft.project) === projectFingerprint(current)) return;
    const when = new Date(draft.savedAt).toLocaleString();
    const name = draft.project.meta.name || "無題";
    const ok = window.confirm(
      `自動保存されたプロジェクトがあります。\n「${name}」\n保存日時: ${when}\n\n復元しますか？`,
    );
    if (ok) {
      useProjectStore.getState().setProject(draft.project);
    }
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().isDocumentDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARDING_KEY) !== "1") {
        setShowOnboarding(true);
      }
    } catch {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    setTimelineHeight((height) =>
      Math.max(
        height,
        Math.min(window.innerHeight * 0.5, 100 + activeLayers.length * 24),
      ),
    );
  }, [activeLayers.length]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => {
      if (mq.matches) setTimelineHeight(140);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Timeline at bottom: drag top edge — height = window bottom - clientY
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizing.current === "timeline") {
        const next = Math.max(
          120,
          Math.min(window.innerHeight * 0.55, window.innerHeight - e.clientY),
        );
        setTimelineHeight(next);
      }
    };
    const onUp = () => {
      resizing.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const dismissOnboarding = (permanent: boolean) => {
    setShowOnboarding(false);
    if (permanent) {
      try {
        localStorage.setItem(ONBOARDING_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="flash-editor">
      <MenuBar />
      <div className="editor-body">
        {/* Workspace: tools | stage | right dock */}
        <div className="workspace-row">
          <div className="workspace-main">
            <ToolsPanel />
            <section className="stage-dock">
              <div className="scene-tabs">
                <button
                  type="button"
                  className={`scene-tab ${editingSymbolId ? "" : "is-active"}`}
                  onClick={() => {
                    if (editingSymbolId) exitSymbolEdit();
                  }}
                >
                  <span className="dot">⦿</span>
                  {composition?.name ?? "シーン 1"}
                </button>
                {editingSymbol && (
                  <>
                    <span className="scene-tab-sep">›</span>
                    <div className="scene-tab is-active is-symbol">
                      <span className="dot">▣</span>
                      {editingSymbol.name}
                      <button
                        type="button"
                        className="scene-tab-close"
                        title="シンボル編集を終了"
                        onClick={() => exitSymbolEdit()}
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
                <EditTargetBar />
                <div className="scene-tab-meta">
                  <StageZoomControls />
                </div>
              </div>
              <div className="stage-canvas-wrap">
                <Stage />
                {showOnboarding && (
                  <OnboardingHint onDismiss={dismissOnboarding} />
                )}
              </div>
              <StageStatusBar />
            </section>
          </div>
          <button
            type="button"
            className="right-dock-toggle"
            onClick={() => setRightDockOpen((open) => !open)}
            title={rightDockOpen ? "右パネルを折りたたむ" : "右パネルを開く"}
            aria-label={
              rightDockOpen ? "右パネルを折りたたむ" : "右パネルを開く"
            }
          >
            {rightDockOpen ? "›" : "‹"}
          </button>
          {rightDockOpen && (
            <aside className="right-dock">
              <div className="right-dock-tabs" role="tablist">
                {(
                  [
                    ["properties", "プロパティ"],
                    ["color", "カラー"],
                    ["library", "ライブラリ"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={rightTab === id}
                    className={
                      rightTab === id
                        ? "right-dock-tab is-active"
                        : "right-dock-tab"
                    }
                    onClick={() => setRightTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="right-dock-body">
                {rightTab === "properties" && <Inspector />}
                {rightTab === "color" && <ColorPanel />}
                {rightTab === "library" && <LibraryPanel />}
              </div>
            </aside>
          )}
        </div>

        {/* Resize handle above timeline (bottom layout) */}
        <div
          className="resize-row"
          title="タイムラインの高さを変更"
          onMouseDown={() => {
            resizing.current = "timeline";
          }}
        />

        {/* Timeline at bottom */}
        <div className="timeline-shell" style={{ height: timelineHeight }}>
          <Timeline />
        </div>
      </div>
    </div>
  );
}
