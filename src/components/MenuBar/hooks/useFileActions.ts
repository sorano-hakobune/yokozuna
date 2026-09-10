import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import type { PngExportSettings, WebmExportSettings } from "@/components/ui/ExportDialogs";
import type { SvgImportSettings } from "@/components/ui/SvgImportDialog";
import {
  listRecentProjects,
  loadRecentSnapshotAsync,
  clearRecentProjects,
  loadAutosaveAsync, projectHasMissingAssetData,
  getPersistencePrefs,
  setPersistencePrefs,
  writeAutosave,
} from "@/lib/project/persistence";
import {
  createAudioAssetFromFile,
  createImageAssetFromFile,
  isSupportedAudioFile,
  isSvgFile,
  isSupportedImageFile,
  materializeSvgShapes,
  openProjectFile,
  parseSvgToShapes,
  pickFiles,
  readSvgText,
  PROJECT_FILE_ACCEPT,
} from "@/lib/project";
import { exportPngSequence, exportWebmVideo } from "@/lib/export";

/** File/import/export/recent/autosave actions backing the File menu. */
export function useFileActions() {
  const project = useProjectStore((s) => s.project);
  const settings = project.settings;
  const setProject = useProjectStore((s) => s.setProject);
  const isDocumentDirty = useProjectStore((s) => s.isDocumentDirty);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addSound = useProjectStore((s) => s.addSound);
  const addBitmapElement = useProjectStore((s) => s.addBitmapElement);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const currentFrame = useProjectStore((s) => s.currentFrame);

  const [exportBusy, setExportBusy] = useState(false);
  const [pngDialogOpen, setPngDialogOpen] = useState(false);
  const [webmDialogOpen, setWebmDialogOpen] = useState(false);
  const [svgPending, setSvgPending] = useState<{
    file: File;
    resolve: (s: SvgImportSettings | null) => void;
  } | null>(null);
  const [recentTick, setRecentTick] = useState(0);
  const recentEntries = listRecentProjects();
  void recentTick;
  const refreshRecent = () => setRecentTick((n) => n + 1);
  const autosavePrefs = getPersistencePrefs();

  const askSvgSettings = (file: File) =>
    new Promise<SvgImportSettings | null>((resolve) => {
      setSvgPending({ file, resolve });
    });

  const importImages = async () => {
    const files = await pickFiles({
      accept:
        "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif,image/svg+xml,.svg,.png,.jpg,.jpeg,.gif,.webp",
      multiple: true,
    });
    const cx = settings.width / 2;
    const cy = settings.height / 2;
    for (const file of files) {
      if (!isSupportedImageFile(file)) continue;
      try {
        if (isSvgFile(file) && selectedLayerId) {
          const settings = await askSvgSettings(file);
          if (!settings) continue;
          const mode = settings.mode;
          if (mode === "bitmap" || mode === "both") {
            const assetId = addAsset(await createImageAssetFromFile(file));
            if (mode === "bitmap") {
              addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
            }
          }
          if (mode === "vector" || mode === "both") {
            try {
              const text = await readSvgText(file);
              const parsed = parseSvgToShapes(text);
              if (parsed.hasVectors) {
                for (const shape of materializeSvgShapes(parsed, cx, cy)) {
                  useProjectStore
                    .getState()
                    .addShapeToLayer(selectedLayerId, currentFrame, shape);
                }
              } else if (mode === "vector") {
                const assetId = addAsset(await createImageAssetFromFile(file));
                addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
              }
            } catch (svgErr) {
              console.warn(svgErr);
              const assetId = addAsset(await createImageAssetFromFile(file));
              addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
            }
          }
          continue;
        }
        const assetId = addAsset(await createImageAssetFromFile(file));
        if (selectedLayerId) {
          addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
        }
      } catch (error) {
        console.error("画像インポートエラー:", error);
      }
    }
  };

  const importAudio = async () => {
    const files = await pickFiles({
      accept: "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm",
      multiple: true,
    });
    for (const file of files) {
      if (!isSupportedAudioFile(file)) continue;
      try {
        const assetId = addAsset(await createAudioAssetFromFile(file));
        addSound(assetId, currentFrame);
      } catch (error) {
        console.error("音声インポートエラー:", error);
      }
    }
  };

  const openProject = async () => {
    if (
      isDocumentDirty() &&
      !window.confirm("未保存の変更があります。プロジェクトを開きますか？")
    ) {
      return;
    }
    const [file] = await pickFiles({ accept: PROJECT_FILE_ACCEPT });
    if (!file) return;
    await openProjectFile(file, setProject);
    refreshRecent();
  };

  const openRecentEntry = (id: string) => {
    void (async () => {
      if (
        isDocumentDirty() &&
        !window.confirm(
          "未保存の変更があります。最近使ったプロジェクトを開きますか？",
        )
      ) {
        return;
      }
      const snap = await loadRecentSnapshotAsync(id);
      if (!snap) {
        window.alert(
          "この項目のスナップショットがありません。\nファイルメニューの「開く…」からプロジェクトファイル（.yoko）を読み込んでください。",
        );
        return;
      }
      setProject(snap);
      refreshRecent();
    })();
  };

  const restoreAutosave = () => {
    void (async () => {
      if (
        isDocumentDirty() &&
        !window.confirm("未保存の変更があります。自動保存を復元しますか？")
      ) {
        return;
      }
      const draft = await loadAutosaveAsync();
      if (!draft?.project) {
        window.alert("自動保存データがありません。");
        return;
      }
      const when = new Date(draft.savedAt).toLocaleString();
      const missing = projectHasMissingAssetData(draft.project);
      const warn = missing
        ? "\n※一部の画像・音声データが含まれていません。"
        : "";
      if (
        !window.confirm(
          `自動保存（${when}）を復元しますか？\n未保存の変更は失われる場合があります。${warn}`,
        )
      ) {
        return;
      }
      setProject(draft.project);
    })();
  };

  const runSoon = (fn: () => void | Promise<void>) => {
    void fn();
  };


  const handleExportPngSequence = () => {
    if (exportBusy) return;
    setPngDialogOpen(true);
  };

  const runPngExport = async (settings: PngExportSettings) => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await exportPngSequence({
        project,
        startFrame: settings.startFrame,
        endFrame: settings.endFrame,
        scale: settings.scale,
        transparent: settings.transparent,
        asZip: settings.asZip,
        filePrefix: settings.filePrefix,
        onProgress: (current, total, fileName) => {
          document.title = `PNG ${current}/${total} ${fileName}`;
        },
      });
      document.title = "YOKOZUNA";
      setPngDialogOpen(false);
      if (result.cancelled) {
        window.alert(`書き出しを中断しました（${result.exported} 枚まで完了）`);
      } else if (result.mode === "zip") {
        window.alert(
          `書き出し完了: ${result.exported} 枚を ZIP にまとめてダウンロードしました。`,
        );
      } else {
        window.alert(`書き出し完了: ${result.exported} 枚の PNG をダウンロードしました。`);
      }
    } catch (error) {
      console.error(error);
      window.alert(
        `PNG 書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
      document.title = "YOKOZUNA";
    }
  };

  const handleExportWebm = () => {
    if (exportBusy) return;
    setWebmDialogOpen(true);
  };

  const runWebmExport = async (settings: WebmExportSettings) => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await exportWebmVideo({
        project,
        startFrame: settings.startFrame,
        endFrame: settings.endFrame,
        fps: settings.fps,
        scale: settings.scale,
        filePrefix: settings.fileName.replace(/\.webm$/i, ""),
        onProgress: (current, totalCount) => {
          document.title = `動画書き出し ${current}/${totalCount}`;
        },
      });
      document.title = "YOKOZUNA";
      setWebmDialogOpen(false);
      if (result.cancelled) {
        window.alert(`書き出しを中断しました（${result.exported} フレームまで）\n${result.fileName}`);
      } else {
        window.alert(`書き出し完了: ${result.fileName}\n（${result.exported} フレーム）`);
      }
    } catch (error) {
      console.error(error);
      window.alert(
        `動画書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
      document.title = "YOKOZUNA";
    }
  };

  return {
    project,
    exportBusy,
    pngDialogOpen,
    setPngDialogOpen,
    webmDialogOpen,
    setWebmDialogOpen,
    runPngExport,
    runWebmExport,
    svgPending,
    resolveSvgPending: (settings: SvgImportSettings | null) => {
      if (svgPending) {
        svgPending.resolve(settings);
        setSvgPending(null);
      }
    },
    recentEntries,
    autosavePrefs,
    refreshRecent,
    importImages: () => runSoon(importImages),
    importAudio: () => runSoon(importAudio),
    openProject: () => runSoon(openProject),
    openRecentEntry,
    restoreAutosave,
    runExportPng: () => runSoon(() => handleExportPngSequence()),
    runExportWebm: () => runSoon(() => handleExportWebm()),
    flushAutosaveNow: () => {
      const ok = writeAutosave(project);
      window.alert(ok ? "自動保存しました。" : "自動保存に失敗しました（容量不足の可能性）。");
    },
    toggleAutosave: () => {
      setPersistencePrefs({ autosaveEnabled: !autosavePrefs.autosaveEnabled });
      refreshRecent();
    },
    clearRecent: () => {
      if (window.confirm("最近使ったファイルの一覧を削除しますか？")) {
        clearRecentProjects();
        refreshRecent();
      }
    },
  };
}
