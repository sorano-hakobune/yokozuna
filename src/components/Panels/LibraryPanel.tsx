import { useMemo, useState, type DragEvent } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useAssetsMap, useSymbols } from "@/stores/projectSelectors";
import {
  createAudioAssetFromFile,
  createImageAssetFromFile,
  isSupportedAudioFile,
  isSvgFile,
  isSupportedImageFile,
  materializeSvgShapes,
  parseSvgToShapes,
  pickFiles,
  readSvgText,
} from "@/lib/project";
import type { Asset, Project, Symbol, SymbolType } from "@/types/project";

type LibraryFilter = "all" | "symbols" | "bitmaps" | "audio";
type LibrarySort = "name" | "type" | "size";
type LibraryView = "list" | "grid";
/** SVG 取り込み方法 */
type SvgImportMode = "bitmap" | "vector" | "both";

function countSymbolUsage(project: Project, symbolId: string): number {
  let n = 0;
  const scanLayers = (layers: { keyframes: { elements: { type: string; symbolId?: string }[] }[] }[]) => {
    for (const layer of layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.type === "instance" && el.symbolId === symbolId) n += 1;
        }
      }
    }
  };
  for (const comp of Object.values(project.compositions)) {
    scanLayers(comp.layers);
  }
  for (const sym of Object.values(project.symbols)) {
    if (sym.id === symbolId) continue;
    scanLayers(sym.layers);
  }
  return n;
}

function countAssetUsage(project: Project, assetId: string): number {
  let n = 0;
  const scanLayers = (layers: { keyframes: { elements: { type: string; assetId?: string }[] }[] }[]) => {
    for (const layer of layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.type === "bitmap" && el.assetId === assetId) n += 1;
        }
      }
    }
  };
  for (const comp of Object.values(project.compositions)) {
    scanLayers(comp.layers);
  }
  for (const sym of Object.values(project.symbols)) {
    scanLayers(sym.layers);
  }
  return n;
}

export function LibraryPanel() {
  const project = useProjectStore((s) => s.project);
  const assetsMap = useAssetsMap();
  const assets = Object.values(assetsMap);
  const symbols = useSymbols();
  const addAsset = useProjectStore((s) => s.addAsset);
  const renameAsset = useProjectStore((s) => s.renameAsset);
  const deleteAsset = useProjectStore((s) => s.deleteAsset);
  const addBitmapElement = useProjectStore((s) => s.addBitmapElement);
  const addShapeToLayer = useProjectStore((s) => s.addShapeToLayer);
  const addSound = useProjectStore((s) => s.addSound);
  const addInstanceElement = useProjectStore((s) => s.addInstanceElement);
  const createSymbol = useProjectStore((s) => s.createSymbol);
  const deleteSymbol = useProjectStore((s) => s.deleteSymbol);
  const renameSymbol = useProjectStore((s) => s.renameSymbol);
  const duplicateSymbol = useProjectStore((s) => s.duplicateSymbol);
  const enterSymbolEdit = useProjectStore((s) => s.enterSymbolEdit);
  const convertSelectionToSymbol = useProjectStore(
    (s) => s.convertSelectionToSymbol,
  );
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const settings = useProjectStore((s) => s.project.settings);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("name");
  const [view, setView] = useState<LibraryView>("list");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  /** Remember last SVG import choice for the session. */
  const [svgMode, setSvgMode] = useState<SvgImportMode>("both");

  const q = query.trim().toLowerCase();

  const sortSymbols = (list: Symbol[]) => {
    const next = [...list];
    if (sort === "name") {
      next.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    } else if (sort === "type") {
      next.sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "ja"),
      );
    } else {
      next.sort(
        (a, b) =>
          b.width * b.height - a.width * a.height ||
          a.name.localeCompare(b.name, "ja"),
      );
    }
    return next;
  };

  const sortAssets = (list: Asset[]) => {
    const next = [...list];
    if (sort === "name") {
      next.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    } else if (sort === "type") {
      next.sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "ja"),
      );
    } else {
      next.sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) ||
          a.name.localeCompare(b.name, "ja"),
      );
    }
    return next;
  };

  const filteredSymbols = useMemo(() => {
    if (filter === "bitmaps" || filter === "audio") return [];
    let list = [...symbols];
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.type.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }
    return sortSymbols(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, filter, q, sort]);

  const filteredImageAssets = useMemo(() => {
    if (filter === "symbols" || filter === "audio") return [];
    let list = assets.filter((a) => a.type === "image" || a.type === "svg");
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      );
    }
    return sortAssets(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, filter, q, sort]);

  const filteredAudioAssets = useMemo(() => {
    if (filter === "symbols" || filter === "bitmaps") return [];
    let list = assets.filter((a) => a.type === "audio");
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      );
    }
    return sortAssets(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, filter, q, sort]);

  const askSvgMode = (fileName: string): SvgImportMode | null => {
    const choice = window.prompt(
      `「${fileName}」の取り込み方法を選んでください:\n` +
        `  1 = ビットマップ（画像として）\n` +
        `  2 = パスに変換（編集可能な図形）\n` +
        `  3 = 両方（ライブラリに画像 + パスを配置）\n` +
        `キャンセルでスキップ`,
      svgMode === "bitmap" ? "1" : svgMode === "vector" ? "2" : "3",
    );
    if (choice == null) return null;
    const c = choice.trim();
    if (c === "1" || c.toLowerCase() === "bitmap" || c === "ビットマップ") {
      setSvgMode("bitmap");
      return "bitmap";
    }
    if (c === "2" || c.toLowerCase() === "vector" || c === "パス") {
      setSvgMode("vector");
      return "vector";
    }
    setSvgMode("both");
    return "both";
  };

  const placeShapesFromSvgText = async (
    svgText: string,
    cx: number,
    cy: number,
  ): Promise<number> => {
    if (!selectedLayerId) {
      window.alert("パスを配置するにはレイヤーを選択してください。");
      return 0;
    }
    const parsed = parseSvgToShapes(svgText);
    if (!parsed.hasVectors) {
      window.alert("この SVG からパスを抽出できませんでした。ビットマップとして取り込みます。");
      return 0;
    }
    const shapes = materializeSvgShapes(parsed, cx, cy);
    for (const shape of shapes) {
      addShapeToLayer(selectedLayerId, currentFrame, shape);
    }
    return shapes.length;
  };

  const importFileList = async (
    files: File[],
    options?: { placeOnStage?: boolean; forceSvgMode?: SvgImportMode },
  ) => {
    const list = files.filter(isSupportedImageFile);
    if (!list.length) {
      setImportStatus("対応画像がありません（PNG / JPEG / GIF / WebP / SVG）");
      return;
    }
    let ok = 0;
    let fail = 0;
    let vectorCount = 0;
    const cx = settings.width / 2;
    const cy = settings.height / 2;
    const place = options?.placeOnStage !== false;

    for (const file of list) {
      try {
        if (isSvgFile(file)) {
          const mode =
            options?.forceSvgMode ?? askSvgMode(file.name) ?? null;
          if (mode == null) continue;

          if (mode === "bitmap" || mode === "both") {
            const assetId = addAsset(await createImageAssetFromFile(file));
            ok += 1;
            setActiveId(assetId);
            if (place && selectedLayerId && mode === "bitmap") {
              addBitmapElement(
                selectedLayerId,
                currentFrame,
                assetId,
                cx,
                cy,
              );
            }
          }
          if (mode === "vector" || mode === "both") {
            const text = await readSvgText(file);
            const n = await placeShapesFromSvgText(text, cx, cy);
            vectorCount += n;
            if (n > 0) ok += 1;
            else if (mode === "vector") {
              // fallback to bitmap asset
              const assetId = addAsset(await createImageAssetFromFile(file));
              ok += 1;
              setActiveId(assetId);
              if (place && selectedLayerId) {
                addBitmapElement(
                  selectedLayerId,
                  currentFrame,
                  assetId,
                  cx,
                  cy,
                );
              }
            }
          }
        } else {
          const assetId = addAsset(await createImageAssetFromFile(file));
          ok += 1;
          setActiveId(assetId);
          if (place && selectedLayerId) {
            addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
          }
        }
      } catch (error) {
        fail += 1;
        console.error("画像インポートエラー:", error);
      }
    }

    const parts: string[] = [];
    if (ok) parts.push(`${ok} 件取り込み`);
    if (vectorCount) parts.push(`パス ${vectorCount} 個`);
    if (fail) parts.push(`失敗 ${fail}`);
    setImportStatus(parts.join(" · ") || null);
    if (parts.length) {
      window.setTimeout(() => setImportStatus(null), 4000);
    }
  };

  const importImages = async () => {
    const files = await pickFiles({
      accept:
        "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif,image/svg+xml,.svg,.png,.jpg,.jpeg,.gif,.webp",
      multiple: true,
    });
    // Library button: store assets; place bitmaps only when layer selected
    await importFileList(files, { placeOnStage: Boolean(selectedLayerId) });
  };

  const importAudio = async () => {
    const files = await pickFiles({
      accept: "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm",
      multiple: true,
    });
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      if (!isSupportedAudioFile(file)) continue;
      try {
        const assetId = addAsset(await createAudioAssetFromFile(file));
        ok += 1;
        setActiveId(assetId);
      } catch (error) {
        fail += 1;
        console.error("音声インポートエラー:", error);
      }
    }
    const parts: string[] = [];
    if (ok) parts.push(`音声 ${ok} 件`);
    if (fail) parts.push(`失敗 ${fail}`);
    setImportStatus(parts.join(" · ") || null);
    if (parts.length) {
      window.setTimeout(() => setImportStatus(null), 4000);
    }
  };

  const placeAudioOnTimeline = (assetId: string) => {
    const id = addSound(assetId);
    if (!id) {
      window.alert(
        "音声をタイムラインに配置できませんでした（シンボル編集中は配置不可）。",
      );
      return;
    }
    setActiveId(assetId);
    setImportStatus("タイムラインに音声クリップを追加しました");
    window.setTimeout(() => setImportStatus(null), 3000);
  };

  const placeAsset = (assetId: string) => {
    if (!selectedLayerId) {
      window.alert("配置するにはレイヤーを選択してください。");
      return;
    }
    addBitmapElement(
      selectedLayerId,
      currentFrame,
      assetId,
      settings.width / 2,
      settings.height / 2,
    );
    setActiveId(assetId);
  };

  /** Place SVG asset as editable vector shapes (re-parse data URL / src). */
  const placeAssetAsVectors = async (asset: Asset) => {
    if (!selectedLayerId) {
      window.alert("配置するにはレイヤーを選択してください。");
      return;
    }
    try {
      let text = "";
      if (asset.src.startsWith("data:")) {
        // data:image/svg+xml;base64,... or utf8
        const comma = asset.src.indexOf(",");
        const meta = asset.src.slice(0, comma);
        const data = asset.src.slice(comma + 1);
        if (/;base64/i.test(meta)) {
          text = atob(data);
          // handle percent-encoded utf8 in some exporters
          try {
            text = decodeURIComponent(escape(text));
          } catch {
            /* keep binary-decoded */
          }
        } else {
          text = decodeURIComponent(data);
        }
      } else {
        const res = await fetch(asset.src);
        text = await res.text();
      }
      const n = await placeShapesFromSvgText(
        text,
        settings.width / 2,
        settings.height / 2,
      );
      if (n > 0) {
        setImportStatus(`パス ${n} 個を配置`);
        window.setTimeout(() => setImportStatus(null), 3000);
      }
    } catch (error) {
      console.error(error);
      window.alert("SVG のパス変換に失敗しました。ビットマップ配置を使ってください。");
    }
  };

  const handleLibraryDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(isSupportedImageFile);
    await importFileList(files, { placeOnStage: false });
  };

  const placeSymbol = (symbolId: string) => {
    if (!selectedLayerId) return;
    addInstanceElement(
      selectedLayerId,
      currentFrame,
      symbolId,
      settings.width / 2,
      settings.height / 2,
    );
    setActiveId(symbolId);
  };

  const handleNewSymbol = () => {
    const name = window.prompt("シンボル名", `Symbol ${symbols.length + 1}`);
    if (!name) return;
    const typeInput = window.prompt(
      "種類: graphic または movieClip",
      "graphic",
    );
    const type: SymbolType =
      typeInput === "movieClip" ? "movieClip" : "graphic";
    const layerId = selectedLayerId;
    const frame = currentFrame;
    const cx = settings.width / 2;
    const cy = settings.height / 2;
    queueMicrotask(() => {
      const id = createSymbol(name, type);
      if (layerId) {
        addInstanceElement(layerId, frame, id, cx, cy);
      }
      setActiveId(id);
    });
  };

  const handleConvert = () => {
    if (!selectedElementId) {
      window.alert("ステージ上のオブジェクトを選択してください。");
      return;
    }
    const name = window.prompt("シンボル名", `Symbol ${symbols.length + 1}`);
    if (!name) return;
    const typeInput = window.prompt(
      "種類: graphic または movieClip",
      "graphic",
    );
    const type: SymbolType =
      typeInput === "movieClip" ? "movieClip" : "graphic";
    queueMicrotask(() => {
      const id = convertSelectionToSymbol(name, type);
      if (id) setActiveId(id);
    });
  };

  const beginRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameDraft(currentName);
  };

  const commitRename = (kind: "symbol" | "asset") => {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (trimmed) {
      if (kind === "symbol") renameSymbol(renamingId, trimmed);
      else renameAsset(renamingId, trimmed);
    }
    setRenamingId(null);
    setRenameDraft("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const handleDuplicateSymbol = (symbolId: string) => {
    const id = duplicateSymbol(symbolId);
    if (id) setActiveId(id);
  };

  const listClass =
    view === "grid" ? "library-list library-list-grid" : "library-list";

  return (
    <section
      className={`panel-block library-panel ${isDragOver ? "is-drag-over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={handleLibraryDrop}
    >
      <div className="panel-heading">
        <span>ライブラリ</span>
        <b>×</b>
      </div>
      <div className="panel-body">
        <div className="library-actions">
          <button
            type="button"
            onClick={importImages}
            title="PNG / JPEG / GIF / WebP / SVG を読み込み"
          >
            画像・SVG
          </button>
          <button
            type="button"
            onClick={importAudio}
            title="MP3 / WAV / OGG / M4A などを読み込み"
          >
            音声
          </button>
          <button type="button" onClick={handleNewSymbol}>
            新規シンボル
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={!selectedElementId}
            title="選択をシンボルに変換 (F8)"
          >
            変換
          </button>
        </div>
        {importStatus && (
          <div className="library-import-status" role="status">
            {importStatus}
          </div>
        )}
        {isDragOver && (
          <div className="library-drop-hint">画像 / SVG をドロップ</div>
        )}

        <div className="library-toolbar">
          <input
            type="search"
            className="library-search"
            placeholder="検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <div className="library-filters">
            {(
              [
                ["all", "すべて"],
                ["symbols", "シンボル"],
                ["bitmaps", "画像"],
                ["audio", "音声"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={
                  filter === id ? "library-filter is-active" : "library-filter"
                }
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="library-org-row">
            <label className="library-sort">
              並び
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as LibrarySort)}
              >
                <option value="name">名前</option>
                <option value="type">種類</option>
                <option value="size">サイズ</option>
              </select>
            </label>
            <div className="library-view-toggle">
              <button
                type="button"
                className={view === "list" ? "is-active" : ""}
                title="リスト表示"
                onClick={() => setView("list")}
              >
                ≡
              </button>
              <button
                type="button"
                className={view === "grid" ? "is-active" : ""}
                title="グリッド表示"
                onClick={() => setView("grid")}
              >
                ⊞
              </button>
            </div>
          </div>
        </div>

        {(filter === "all" || filter === "symbols") && (
          <>
            <div className="library-section-label">
              シンボル
              <span className="library-count">{filteredSymbols.length}</span>
            </div>
            {filteredSymbols.length === 0 ? (
              <p className="library-empty">
                {symbols.length === 0
                  ? "まだシンボルがありません。ステージ上の選択を「変換」すると、ここに追加されます。"
                  : "その検索に合うシンボルは見つかりませんでした。"}
              </p>
            ) : (
              <div className={listClass}>
                {filteredSymbols.map((symbol) => {
                  const usage = countSymbolUsage(project, symbol.id);
                  return (
                    <div
                      key={symbol.id}
                      className={
                        activeId === symbol.id
                          ? "library-item-row is-active"
                          : "library-item-row"
                      }
                    >
                      {renamingId === symbol.id ? (
                        <input
                          className="library-rename-input"
                          value={renameDraft}
                          autoFocus
                          spellCheck={false}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => commitRename("symbol")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename("symbol");
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="library-item"
                          title="クリックで配置 / ダブルクリックで名前変更"
                          onClick={() => placeSymbol(symbol.id)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            beginRename(symbol.id, symbol.name);
                          }}
                        >
                          <span className="library-thumb library-thumb-symbol">
                            {symbol.type === "movieClip" ? "MC" : "G"}
                          </span>
                          <span className="library-item-text">
                            {symbol.name}
                            <small className="library-meta">
                              {" "}
                              {symbol.type} · {symbol.width}×{symbol.height}
                              {usage > 0 ? ` · 使用 ${usage}` : ""}
                            </small>
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="library-item-edit"
                        title="シンボルを編集"
                        onClick={() => enterSymbolEdit(symbol.id)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="library-item-dup"
                        title="複製"
                        onClick={() => handleDuplicateSymbol(symbol.id)}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className="library-item-delete"
                        title="削除"
                        onClick={() => {
                          if (
                            window.confirm(`「${symbol.name}」を削除しますか？`)
                          ) {
                            deleteSymbol(symbol.id);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {(filter === "all" || filter === "bitmaps") && (
          <>
            <div className="library-section-label">
              画像・SVG
              <span className="library-count">{filteredImageAssets.length}</span>
            </div>
            {filteredImageAssets.length === 0 ? (
              <p className="library-empty">
                {assets.filter((a) => a.type === "image" || a.type === "svg")
                  .length === 0
                  ? "まだ画像がありません。上の「画像・SVG」か、ここにドロップ、またはステージへドロップしてください。"
                  : "その検索に合う画像は見つかりませんでした。"}
              </p>
            ) : (
              <div className={listClass}>
                {filteredImageAssets.map((asset) => {
                  const usage = countAssetUsage(project, asset.id);
                  const isSvg = asset.type === "svg";
                  return (
                    <div
                      key={asset.id}
                      className={
                        activeId === asset.id
                          ? "library-item-row is-active"
                          : "library-item-row"
                      }
                    >
                      {renamingId === asset.id ? (
                        <input
                          className="library-rename-input"
                          value={renameDraft}
                          autoFocus
                          spellCheck={false}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => commitRename("asset")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename("asset");
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="library-item"
                          title="クリックで画像として配置 / ダブルクリックで名前変更"
                          onClick={() => placeAsset(asset.id)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            beginRename(asset.id, asset.name);
                          }}
                        >
                          {asset.src ? (
                            <img
                              className="library-thumb"
                              src={asset.src}
                              alt=""
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <span className="library-thumb" />
                          )}
                          <span className="library-item-text">
                            {asset.name}
                            <small className="library-meta">
                              {isSvg ? " SVG" : ""}
                              {asset.width && asset.height
                                ? `  ${asset.width}×${asset.height}`
                                : ""}
                              {usage > 0 ? ` · 使用 ${usage}` : ""}
                            </small>
                          </span>
                        </button>
                      )}
                      {isSvg && (
                        <button
                          type="button"
                          className="library-item-vector"
                          title="パスに変換して配置（編集可能な図形）"
                          onClick={() => placeAssetAsVectors(asset)}
                        >
                          パス
                        </button>
                      )}
                      <button
                        type="button"
                        className="library-item-delete"
                        title="削除（使用中の配置も除去）"
                        onClick={() => {
                          if (
                            window.confirm(
                              `「${asset.name}」を削除しますか？\nステージ上の配置も削除されます。`,
                            )
                          ) {
                            deleteAsset(asset.id);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {(filter === "all" || filter === "audio") && (
          <>
            <div className="library-section-label">
              音声
              <span className="library-count">{filteredAudioAssets.length}</span>
            </div>
            {filteredAudioAssets.length === 0 ? (
              <p className="library-empty">
                {assets.filter((a) => a.type === "audio").length === 0
                  ? "まだ音声がありません。「音声」ボタンから MP3 / WAV などを読み込んでください。"
                  : "その検索に合う音声は見つかりませんでした。"}
              </p>
            ) : (
              <div className={listClass}>
                {filteredAudioAssets.map((asset) => {
                  const sec = asset.duration ?? 0;
                  const secLabel =
                    sec > 0
                      ? ` ${sec < 10 ? sec.toFixed(1) : Math.round(sec)}秒`
                      : "";
                  return (
                    <div
                      key={asset.id}
                      className={
                        activeId === asset.id
                          ? "library-item-row is-active"
                          : "library-item-row"
                      }
                    >
                      <button
                        type="button"
                        className="library-item"
                        title="クリックでタイムラインに配置"
                        onClick={() => placeAudioOnTimeline(asset.id)}
                      >
                        <span className="library-thumb library-thumb-audio">
                          ♪
                        </span>
                        <span className="library-item-text">
                          {asset.name}
                          <small className="library-meta">{secLabel}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="library-item-delete"
                        title="削除"
                        onClick={() => {
                          if (
                            window.confirm(`「${asset.name}」を削除しますか？`)
                          ) {
                            deleteAsset(asset.id);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
