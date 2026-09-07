import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  listRecentProjects,
  loadRecentSnapshot,
  clearRecentProjects,
  loadAutosave,
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
  const [recentTick, setRecentTick] = useState(0);
  const recentEntries = listRecentProjects();
  void recentTick;
  const refreshRecent = () => setRecentTick((n) => n + 1);
  const autosavePrefs = getPersistencePrefs();

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
          const choice = window.prompt(
            `「${file.name}」の取り込み:\n  1 = 画像\n  2 = パスに変換\n  3 = 両方`,
            "3",
          );
          if (choice == null) continue;
          const mode =
            choice.trim() === "1"
              ? "bitmap"
              : choice.trim() === "2"
                ? "vector"
                : "both";
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
    const [file] = await pickFiles({ accept: "application/json,.json" });
    if (!file) return;
    await openProjectFile(file, setProject);
    refreshRecent();
  };

  const openRecentEntry = (id: string) => {
    if (
      isDocumentDirty() &&
      !window.confirm("未保存の変更があります。最近使ったプロジェクトを開きますか？")
    ) {
      return;
    }
    const snap = loadRecentSnapshot(id);
    if (!snap) {
      window.alert(
        "この項目のスナップショットがありません。\nファイルメニューの「開く…」から JSON を読み込んでください。",
      );
      return;
    }
    setProject(snap);
    refreshRecent();
  };

  const restoreAutosave = () => {
    if (
      isDocumentDirty() &&
      !window.confirm("未保存の変更があります。自動保存を復元しますか？")
    ) {
      return;
    }
    const draft = loadAutosave();
    if (!draft?.project) {
      window.alert("自動保存データがありません。");
      return;
    }
    const when = new Date(draft.savedAt).toLocaleString();
    if (
      !window.confirm(
        `自動保存（${when}）を復元しますか？\n未保存の変更は失われる場合があります。`,
      )
    ) {
      return;
    }
    setProject(draft.project);
  };

  const runSoon = (fn: () => Promise<void>) => {
    void fn();
  };

  const handleExportPngSequence = async () => {
    if (exportBusy) return;
    const comp = project.compositions[project.activeCompositionId];
    if (!comp) {
      window.alert("アクティブなコンポジションがありません。");
      return;
    }
    const last = Math.max(0, comp.duration - 1);
    const startStr = window.prompt(`開始フレーム (0〜${last})`, "0");
    if (startStr === null) return;
    const endStr = window.prompt(`終了フレーム (0〜${last})`, String(last));
    if (endStr === null) return;
    const scaleStr = window.prompt("解像度スケール (1 = 100%)", "1");
    if (scaleStr === null) return;
    const transparent = window.confirm(
      "背景を透明にしますか？\n\nOK = 透明PNG\nキャンセル = ドキュメント背景色",
    );
    const asZip = window.confirm(
      "ZIPにまとめてダウンロードしますか？\n\nOK = 1つのZIP\nキャンセル = PNGを個別に保存",
    );

    const startFrame = Math.max(0, Math.min(last, Math.round(Number(startStr) || 0)));
    const endFrame = Math.max(startFrame, Math.min(last, Math.round(Number(endStr) || last)));
    const scale = Math.max(0.25, Math.min(4, Number(scaleStr) || 1));
    const total = endFrame - startFrame + 1;

    if (
      !window.confirm(
        `PNG 連番を書き出します。\n` +
          `フレーム ${startFrame}〜${endFrame}（${total} 枚）\n` +
          `サイズ ${Math.round(project.settings.width * scale)}×${Math.round(project.settings.height * scale)}\n` +
          `背景: ${transparent ? "透明" : "ドキュメント色"}\n` +
          `形式: ${asZip ? "ZIP" : "個別PNG"}`,
      )
    ) {
      return;
    }

    setExportBusy(true);
    try {
      const result = await exportPngSequence({
        project,
        startFrame,
        endFrame,
        scale,
        transparent,
        asZip,
        onProgress: (current, totalCount, fileName) => {
          document.title = `書き出し中 ${current}/${totalCount} — ${fileName}`;
        },
      });
      document.title = "YOKOZUNA";
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
        `書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExportBusy(false);
      document.title = "YOKOZUNA";
    }
  };

  const handleExportWebm = async () => {
    if (exportBusy) return;
    const comp = project.compositions[project.activeCompositionId];
    if (!comp) {
      window.alert("アクティブなコンポジションがありません。");
      return;
    }
    const last = Math.max(0, comp.duration - 1);
    const fpsDefault = project.settings.fps || 24;

    const startStr = window.prompt(`開始フレーム (0〜${last})`, "0");
    if (startStr === null) return;
    const endStr = window.prompt(`終了フレーム (0〜${last})`, String(last));
    if (endStr === null) return;
    const fpsStr = window.prompt(`フレームレート (fps)`, String(fpsDefault));
    if (fpsStr === null) return;
    const scaleStr = window.prompt("解像度スケール (1 = 100%)", "1");
    if (scaleStr === null) return;

    const startFrame = Math.max(0, Math.min(last, Math.round(Number(startStr) || 0)));
    const endFrame = Math.max(startFrame, Math.min(last, Math.round(Number(endStr) || last)));
    const fps = Math.max(1, Math.min(60, Number(fpsStr) || fpsDefault));
    const scale = Math.max(0.25, Math.min(4, Number(scaleStr) || 1));
    const total = endFrame - startFrame + 1;
    const sec = (total / fps).toFixed(2);

    if (
      !window.confirm(
        `WebM 動画を書き出します。\n` +
          `フレーム ${startFrame}〜${endFrame}（${total} 枚）\n` +
          `${Math.round(project.settings.width * scale)}×${Math.round(project.settings.height * scale)} @ ${fps} fps\n` +
          `約 ${sec} 秒\n\n` +
          `※ 背景はドキュメント色です（動画の透明はブラウザ依存のため非対応）`,
      )
    ) {
      return;
    }

    setExportBusy(true);
    try {
      const result = await exportWebmVideo({
        project,
        startFrame,
        endFrame,
        fps,
        scale,
        onProgress: (current, totalCount) => {
          document.title = `動画書き出し ${current}/${totalCount}`;
        },
      });
      document.title = "YOKOZUNA";
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
    recentEntries,
    autosavePrefs,
    refreshRecent,
    importImages: () => runSoon(importImages),
    importAudio: () => runSoon(importAudio),
    openProject: () => runSoon(openProject),
    openRecentEntry,
    restoreAutosave,
    runExportPng: () => runSoon(handleExportPngSequence),
    runExportWebm: () => runSoon(handleExportWebm),
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
