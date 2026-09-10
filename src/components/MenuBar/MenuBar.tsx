import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  downloadProjectJson,
} from "@/lib/project";
import type { FrameLabel, Layer } from "@/types/project";
import { Menu } from "./Menu";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useFileActions } from "./hooks/useFileActions";
import type { MenuKey, MenuItemEntry } from "./menuTypes";
import { buildEditItems } from "./menus/buildEditItems";
import { buildViewItems } from "./menus/buildViewItems";
import { buildAnimationItems } from "./menus/buildAnimationItems";
import { buildLayerItems } from "./menus/buildLayerItems";
import { buildObjectItems } from "./menus/buildObjectItems";
import { SvgImportDialog } from "@/components/ui/SvgImportDialog";
import { PngExportDialog, WebmExportDialog } from "@/components/ui/ExportDialogs";
import { SymbolDialog } from "@/components/ui/SymbolDialog";

const EMPTY_LABELS: FrameLabel[] = [];
const EMPTY_LAYERS: Layer[] = [];

export function MenuBar() {
  const [open, setOpen] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLElement>(null);
  const project = useProjectStore((s) => s.project);
  const settings = project.settings;
  const canvasZoom = useProjectStore((s) => s.canvasZoom);
  const setCanvasZoom = useProjectStore((s) => s.setCanvasZoom);
  const zoomCanvas = useProjectStore((s) => s.zoomCanvas);
  const setCanvasPan = useProjectStore((s) => s.setCanvasPan);
  const createNewProject = useProjectStore((s) => s.createNewProject);
  const markProjectSaved = useProjectStore((s) => s.markProjectSaved);
  const isDocumentDirty = useProjectStore((s) => s.isDocumentDirty);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const addFrameLabel = useProjectStore((s) => s.addFrameLabel);
  const removeFrameLabel = useProjectStore((s) => s.removeFrameLabel);
  const addFolder = useProjectStore((s) => s.addFolder);
  const setLayerParent = useProjectStore((s) => s.setLayerParent);
  const addKeyframe = useProjectStore((s) => s.addKeyframe);
  const insertFrames = useProjectStore((s) => s.insertFrames);
  const removeFrames = useProjectStore((s) => s.removeFrames);
  const removeKeyframe = useProjectStore((s) => s.removeKeyframe);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const copySelection = useProjectStore((s) => s.copySelection);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const alignSelection = useProjectStore((s) => s.alignSelection);
  const distributeSelection = useProjectStore((s) => s.distributeSelection);
  const clipboard = useProjectStore((s) => s.clipboard);
  const removeElement = useProjectStore((s) => s.removeElement);
  const updateMeta = useProjectStore((s) => s.updateMeta);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const pastLength = useProjectStore((s) => s.past.length);
  const futureLength = useProjectStore((s) => s.future.length);
  const convertSelectionToSymbol = useProjectStore((s) => s.convertSelectionToSymbol);
  const createSymbol = useProjectStore((s) => s.createSymbol);
  const [symbolDialog, setSymbolDialog] = useState<{
    mode: "create" | "convert";
    defaultName: string;
  } | null>(null);
  const addInstanceElement = useProjectStore((s) => s.addInstanceElement);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const reorderLayers = useProjectStore((s) => s.reorderLayers);
  const addLayer = useProjectStore((s) => s.addLayer);
  const setKeyframeTween = useProjectStore((s) => s.setKeyframeTween);
  const layersForMenu = useProjectStore((s) => {
    if (s.editingSymbolId)
      return s.project.symbols[s.editingSymbolId]?.layers ?? EMPTY_LAYERS;
    return (
      s.project.compositions[s.project.activeCompositionId]?.layers ??
      EMPTY_LAYERS
    );
  });
  const frameLabels = useProjectStore(
    (s) =>
      s.project.compositions[s.project.activeCompositionId]?.labels ??
      EMPTY_LABELS,
  );
  const toggleOnionSkin = useProjectStore((s) => s.toggleOnionSkin);
  const onionSkinEnabled = useProjectStore((s) => s.onionSkinEnabled);
  const removeLayer = useProjectStore((s) => s.removeLayer);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const file = useFileActions();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const close = () => setOpen(null);

  const promptConvertToSymbol = () => {
    if (!selectedElementId) {
      window.alert("ステージ上のオブジェクトを選択してください。");
      return;
    }
    setSymbolDialog({ mode: "convert", defaultName: "Symbol 1" });
  };

  const promptNewSymbol = () => {
    setSymbolDialog({ mode: "create", defaultName: "Symbol 1" });
  };

  const handleSymbolDialogConfirm = (cfg: {
    name: string;
    symbolType: "graphic" | "movieClip";
  }) => {
    const dlg = symbolDialog;
    setSymbolDialog(null);
    if (!dlg) return;
    if (dlg.mode === "convert") {
      queueMicrotask(() => {
        convertSelectionToSymbol(cfg.name, cfg.symbolType);
      });
    } else {
      const layerId = selectedLayerId;
      const frame = currentFrame;
      const cx = settings.width / 2;
      const cy = settings.height / 2;
      queueMicrotask(() => {
        const id = createSymbol(cfg.name, cfg.symbolType);
        if (layerId) {
          addInstanceElement(layerId, frame, id, cx, cy);
        }
      });
    }
  };

  const renameSelectedLayer = () => {
    if (!selectedLayerId) return;
    const layer = layersForMenu.find((l) => l.id === selectedLayerId);
    if (!layer) return;
    const next = window.prompt("レイヤー名", layer.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed && trimmed !== layer.name) {
      updateLayer(selectedLayerId, { name: trimmed });
    }
  };

  const recentMenuItems: MenuItemEntry[] = file.recentEntries.slice(0, 8).map((entry) => ({
    // Snapshots may live in IndexedDB even when localStorage flagged hasSnapshot=false (legacy).
    label: `最近: ${entry.name}`,
    disabled: false,
    onClick: () => file.openRecentEntry(entry.id),
  }));

  const fileItems: MenuItemEntry[] = [
    {
      label: "新規プロジェクト",
      kicker: "Ctrl+N",
      onClick: () => {
        if (
          isDocumentDirty() &&
          !window.confirm("未保存の変更があります。新規プロジェクトを作成しますか？")
        ) {
          return;
        }
        createNewProject("無題のプロジェクト");
        updateMeta({ name: "無題のプロジェクト" });
      },
    },
    { label: "開く…", kicker: "Ctrl+O", onClick: file.openProject },
    {
      label: "保存",
      kicker: "Ctrl+S",
      onClick: () => {
        void downloadProjectJson(project).then((result) => {
          if (result.status === "cancelled") return;
          // Reflect the name chosen in the save dialog
          const chosen = result.fileName.replace(/\.[^.]+$/, "");
          if (chosen && chosen !== project.meta.name) {
            updateMeta({ name: chosen });
          }
          markProjectSaved();
          file.refreshRecent();
        });
      },
    },
    { label: "自動保存を今すぐ実行", onClick: file.flushAutosaveNow },
    { label: "自動保存から復元…", onClick: file.restoreAutosave },
    {
      label: file.autosavePrefs.autosaveEnabled ? "自動保存をオフ" : "自動保存をオン",
      onClick: file.toggleAutosave,
    },
    "sep",
    ...recentMenuItems,
    ...(file.recentEntries.length
      ? [{ label: "最近の一覧をクリア", onClick: file.clearRecent } as const]
      : []),
    "sep",
    { label: "画像・SVGを読み込む…", onClick: file.importImages },
    { label: "音声を読み込む…", onClick: file.importAudio },
    "sep",
    {
      label: file.exportBusy ? "PNG連番を書き出し中…" : "PNG連番を書き出す…",
      disabled: file.exportBusy,
      onClick: file.runExportPng,
    },
    {
      label: file.exportBusy ? "WebMを書き出し中…" : "WebMを書き出す…",
      disabled: file.exportBusy,
      onClick: file.runExportWebm,
    },
  ];

  const editItems = buildEditItems({
    pastLength,
    futureLength,
    clipboardLength: clipboard?.length ?? 0,
    hasSelection: Boolean(selectedElementId),
    selectedLayerId,
    currentFrame,
    undo,
    redo,
    cutSelection,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    removeElement,
    selectedElementId,
  });

  const viewItems = buildViewItems({
    canvasZoom,
    settings,
    onionSkinEnabled,
    zoomCanvas,
    setCanvasZoom,
    setCanvasPan,
    updateSettings,
    toggleOnionSkin,
  });

  const animationItems = buildAnimationItems({
    currentFrame,
    selectedLayerId,
    frameLabels,
    addFrameLabel,
    removeFrameLabel,
    insertFrames,
    removeFrames,
    addKeyframe,
    removeKeyframe,
    setKeyframeTween,
  });

  const layerItems = buildLayerItems({
    selectedLayerId,
    layers: layersForMenu,
    addLayer,
    addFolder,
    setLayerParent,
    removeLayer,
    updateLayer,
    reorderLayers,
    onRename: renameSelectedLayer,
  });

  const objectItems = buildObjectItems({
    hasSelection: Boolean(selectedElementId),
    onConvertToSymbol: promptConvertToSymbol,
    onNewSymbol: promptNewSymbol,
    alignSelection,
    distributeSelection,
  });

  const windowItems: MenuItemEntry[] = [
    {
      label: "ドキュメント設定…",
      onClick: () => {
        document.querySelector<HTMLDialogElement>("#document-settings")?.showModal();
      },
    },
  ];

  const helpItems: MenuItemEntry[] = [
    { label: "キーボードショートカット", onClick: () => setShowShortcuts(true) },
    {
      label: "バージョン情報",
      onClick: () => window.alert("YOKOZUNA Animation Desk\n2D タイムラインアニメーション"),
    },
  ];

  const isDirty = isDocumentDirty();

  return (
    <header className="flash-menubar" ref={rootRef}>
      <div className="brand-lockup" title="YOKOZUNA Animation Desk">
        YOKOZUNA
      </div>
      <nav className="flash-menu">
        <Menu id="file" label="ファイル" open={open} setOpen={setOpen} items={fileItems} onClose={close} />
        <Menu id="edit" label="編集" open={open} setOpen={setOpen} items={editItems} onClose={close} />
        <Menu id="view" label="表示" open={open} setOpen={setOpen} items={viewItems} onClose={close} />
        {!narrow && (
          <>
            <Menu id="animation" label="アニメーション" open={open} setOpen={setOpen} items={animationItems} onClose={close} />
            <Menu id="layer" label="レイヤー" open={open} setOpen={setOpen} items={layerItems} onClose={close} />
            <Menu id="object" label="オブジェクト" open={open} setOpen={setOpen} items={objectItems} onClose={close} />
            <Menu id="window" label="ウィンドウ" open={open} setOpen={setOpen} items={windowItems} onClose={close} />
            <Menu id="help" label="ヘルプ" open={open} setOpen={setOpen} items={helpItems} onClose={close} />
          </>
        )}
        {narrow && (
          <Menu
            id="more"
            label="その他"
            open={open}
            setOpen={setOpen}
            items={[
              ...animationItems,
              "sep" as const,
              ...layerItems,
              "sep" as const,
              ...objectItems,
              "sep" as const,
              ...windowItems,
              "sep" as const,
              ...helpItems,
            ]}
            onClose={close}
          />
        )}
      </nav>
      <div className="menubar-meta">
        <span
          className="menubar-meta-item menubar-project-name"
          title={isDirty ? "未保存の変更があります" : "保存済み"}
        >
          <small>プロジェクト</small>
          {project.meta.name}
          {isDirty ? (
            <span className="save-dot" aria-label="未保存"> {" "}●</span>
          ) : (
            <span className="save-ok" aria-label="保存済み"> {" "}✓</span>
          )}
        </span>
      </div>
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      <SymbolDialog
        open={symbolDialog != null}
        mode={symbolDialog?.mode ?? "create"}
        defaultName={symbolDialog?.defaultName ?? "Symbol 1"}
        onClose={() => setSymbolDialog(null)}
        onConfirm={handleSymbolDialogConfirm}
      />
      <PngExportDialog
        open={file.pngDialogOpen}
        lastFrame={Math.max(0, (project.compositions[project.activeCompositionId]?.duration ?? project.settings.duration) - 1)}
        defaultPrefix={project.meta.name || "frame"}
        onClose={() => file.setPngDialogOpen(false)}
        onExport={file.runPngExport}
        busy={file.exportBusy}
      />
      <WebmExportDialog
        open={file.webmDialogOpen}
        lastFrame={Math.max(0, (project.compositions[project.activeCompositionId]?.duration ?? project.settings.duration) - 1)}
        defaultFps={project.settings.fps}
        defaultName={(project.meta.name || "export") + ".webm"}
        onClose={() => file.setWebmDialogOpen(false)}
        onExport={file.runWebmExport}
        busy={file.exportBusy}
      />
      <SvgImportDialog
        open={file.svgPending != null}
        fileName={file.svgPending?.file.name ?? ""}
        onClose={() => file.resolveSvgPending(null)}
        onImport={(s) => file.resolveSvgPending(s)}
      />
    </header>
  );
}
