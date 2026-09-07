import type { MenuItemEntry } from "../menuTypes";

export type AnimationMenuDeps = {
  currentFrame: number;
  selectedLayerId: string | undefined;
  frameLabels: { id: string; frame: number }[];
  addFrameLabel: (frame: number, name: string) => void;
  removeFrameLabel: (id: string) => void;
  insertFrames: (frame: number, count: number, scope: "all") => void;
  removeFrames: (frame: number, count: number, scope: "all") => void;
  addKeyframe: (layerId: string, frame: number) => void;
  removeKeyframe: (layerId: string, frame: number) => void;
  setKeyframeTween: (layerId: string, frame: number, tween: "none" | "motion" | "shape", easing: "linear") => void;
};

export function buildAnimationItems(d: AnimationMenuDeps): MenuItemEntry[] {
  return [
    {
      label: "フレームラベルを追加…",
      onClick: () => {
        const name = window.prompt(`フレーム ${d.currentFrame} のラベル名`, `ラベル ${d.currentFrame}`);
        if (name == null) return;
        d.addFrameLabel(d.currentFrame, name);
      },
    },
    {
      label: "フレームラベルを削除（現在）",
      disabled: !d.frameLabels.some((l) => l.frame === d.currentFrame),
      onClick: () => {
        const hit = d.frameLabels.find((l) => l.frame === d.currentFrame);
        if (hit) d.removeFrameLabel(hit.id);
      },
    },
    "sep",
    { label: "フレームを挿入", kicker: "F5", onClick: () => d.insertFrames(d.currentFrame, 1, "all") },
    { label: "フレームを削除", kicker: "Shift+F5", onClick: () => d.removeFrames(d.currentFrame, 1, "all") },
    "sep",
    {
      label: "キーフレームを挿入",
      kicker: "F6",
      onClick: () => {
        if (d.selectedLayerId) d.addKeyframe(d.selectedLayerId, d.currentFrame);
      },
    },
    {
      label: "キーフレームを削除",
      kicker: "Shift+F6",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.removeKeyframe(d.selectedLayerId, d.currentFrame);
      },
    },
    "sep",
    {
      label: "トゥイーンを追加（モーション）",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.setKeyframeTween(d.selectedLayerId, d.currentFrame, "motion", "linear");
      },
    },
    {
      label: "トゥイーンを追加（シェイプ）",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.setKeyframeTween(d.selectedLayerId, d.currentFrame, "shape", "linear");
      },
    },
    {
      label: "トゥイーンを解除",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.setKeyframeTween(d.selectedLayerId, d.currentFrame, "none", "linear");
      },
    },
  ];
}
