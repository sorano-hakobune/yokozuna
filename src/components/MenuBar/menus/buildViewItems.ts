import { generateId } from "@/lib/id";
import type { MenuItemEntry } from "../menuTypes";

export type ViewMenuDeps = {
  canvasZoom: number;
  settings: {
    width: number;
    height: number;
    showGrid?: boolean;
    snapToGrid?: boolean;
    gridSize?: number;
    showGuides?: boolean;
    snapToGuides?: boolean;
    guides?: { id: string }[];
  };
  onionSkinEnabled: boolean;
  zoomCanvas: (z: number) => void;
  setCanvasZoom: (z: number) => void;
  setCanvasPan: (p: { x: number; y: number }) => void;
  updateSettings: (p: Record<string, unknown>) => void;
  toggleOnionSkin: () => void;
};

export function buildViewItems(d: ViewMenuDeps): MenuItemEntry[] {
  return [
    { label: "ズームイン", onClick: () => d.zoomCanvas(d.canvasZoom * 1.25) },
    { label: "ズームアウト", onClick: () => d.zoomCanvas(d.canvasZoom / 1.25) },
    {
      label: "100%",
      onClick: () => {
        d.setCanvasZoom(1);
        d.setCanvasPan({ x: 0, y: 0 });
      },
    },
    {
      label: "ステージ全体を表示",
      onClick: () => {
        d.setCanvasZoom(1);
        d.setCanvasPan({ x: 0, y: 0 });
      },
    },
    "sep",
    {
      label: d.settings.showGrid ? "グリッドを隠す" : "グリッドを表示",
      kicker: "G",
      onClick: () => d.updateSettings({ showGrid: !d.settings.showGrid }),
    },
    {
      label: d.settings.snapToGrid ? "グリッドスナップをオフ" : "グリッドスナップをオン",
      onClick: () => d.updateSettings({ snapToGrid: !d.settings.snapToGrid }),
    },
    {
      label: "グリッドサイズ…",
      onClick: () => {
        const cur = d.settings.gridSize ?? 20;
        const entered = window.prompt("グリッドサイズ（px）", String(cur));
        if (entered == null) return;
        const n = Number(entered);
        if (Number.isFinite(n) && n > 0) d.updateSettings({ gridSize: n });
      },
    },
    "sep",
    {
      label: d.settings.showGuides === false ? "ガイドを表示" : "ガイドを隠す",
      onClick: () => d.updateSettings({ showGuides: d.settings.showGuides === false }),
    },
    {
      label:
        d.settings.snapToGuides === false
          ? "ガイドスナップをオン"
          : "ガイドスナップをオフ",
      onClick: () => d.updateSettings({ snapToGuides: d.settings.snapToGuides === false }),
    },
    {
      label: "垂直ガイドを追加",
      onClick: () => {
        const guides = [...((d.settings.guides ?? []) as { id: string; orientation: "vertical"; position: number }[])];
        guides.push({
          id: generateId("guide"),
          orientation: "vertical",
          position: Math.round(d.settings.width / 2),
        });
        d.updateSettings({ guides, showGuides: true });
      },
    },
    {
      label: "水平ガイドを追加",
      onClick: () => {
        const guides = [...((d.settings.guides ?? []) as { id: string; orientation: "horizontal"; position: number }[])];
        guides.push({
          id: generateId("guide"),
          orientation: "horizontal",
          position: Math.round(d.settings.height / 2),
        });
        d.updateSettings({ guides, showGuides: true });
      },
    },
    {
      label: "ガイドをすべて削除",
      disabled: !(d.settings.guides && d.settings.guides.length),
      onClick: () => d.updateSettings({ guides: [] }),
    },
    "sep",
    {
      label: d.onionSkinEnabled ? "オニオンスキンをオフ" : "オニオンスキンをオン",
      kicker: "O",
      onClick: () => d.toggleOnionSkin(),
    },
  ];
}
