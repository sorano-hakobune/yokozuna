import { useEffect, useRef, useState } from "react";
import { MenuBar } from "@/components/MenuBar/MenuBar";
import { ToolsPanel } from "@/components/ToolsPanel/ToolsPanel";
import { Timeline } from "@/components/Timeline";
import { Stage } from "@/components/Stage";
import { Inspector } from "@/components/Inspector";
import { ColorPanel } from "@/components/Panels/ColorPanel";
import { LibraryPanel } from "@/components/Panels/LibraryPanel";
import { useProjectStore } from "@/stores/projectStore";
import {
  loadAutosaveAsync,
  projectFingerprint,
  projectHasMissingAssetData,
} from "@/lib/project/persistence";
import {
  migrateProjectData,
  projectSchema,
} from "@/lib/project/projectSchema";
import type { Project } from "@/types/project";
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
  const clampTimelineHeight = (h: number) => {
    // Keep enough room for the stage in short windows (e.g. 800×600).
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxByViewport = Math.max(120, Math.floor(vh * 0.34));
    return Math.max(120, Math.min(h, maxByViewport, 420));
  };

  const [timelineHeight, setTimelineHeight] = useState(() =>
    clampTimelineHeight(Math.max(160, 100 + activeLayers.length * 24)),
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

  // Offer to restore autosave draft once on launch (IndexedDB-aware)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadAutosaveAsync();
      if (cancelled || !draft?.project) return;
      const parsed = projectSchema.safeParse(migrateProjectData(draft.project));
      if (!parsed.success) {
        console.warn(
          "自動保存データが破損しているため復元をスキップしました",
          parsed.error.issues.length,
        );
        return;
      }
      const restored = parsed.data as Project;
      const current = useProjectStore.getState().project;
      if (projectFingerprint(restored) === projectFingerprint(current)) return;
      const when = new Date(draft.savedAt).toLocaleString();
      const name = restored.meta.name || "無題";
      const missing = projectHasMissingAssetData(restored);
      const warn = missing
        ? "\n\n※一部の画像・音声データが含まれていません。"
        : "";
      const ok = window.confirm(
        `自動保存されたプロジェクトがあります。\n「${name}」\n保存日時: ${when}${warn}\n\n復元しますか？`,
      );
      if (ok && !cancelled) {
        useProjectStore.getState().setProject(restored);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  // Grow slightly with layer count, but never steal stage space on short windows.
  useEffect(() => {
    setTimelineHeight((height) =>
      clampTimelineHeight(
        Math.max(height, 100 + activeLayers.length * 24),
      ),
    );
  }, [activeLayers.length]);

  // Re-clamp when the window is resized (e.g. user shrinks to 800×600).
  useEffect(() => {
    const onResize = () => {
      setTimelineHeight((h) => clampTimelineHeight(h));
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Timeline at bottom: drag top edge — height = window bottom - clientY
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizing.current === "timeline") {
        const next = clampTimelineHeight(window.innerHeight - e.clientY);
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
