import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { clampMenuPosition } from "@/components/ui/ContextMenu";

export type StageContextMenuState = {
  x: number;
  y: number;
  targetElementId: string | null;
  targetLayerId: string | null;
};

type Props = {
  menu: StageContextMenuState;
  hasSelection: boolean;
  hasClipboard: boolean;
  canEdit: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  canEditPathVertices?: boolean;
  onEditPathVertices?: () => void;
  canResetPivot?: boolean;
  onResetPivot?: () => void;
};

type Item =
  | { kind: "item"; label: string; shortcut?: string; disabled?: boolean; action: () => void }
  | { kind: "sep" };

export function StageContextMenu({
  menu,
  hasSelection,
  hasClipboard,
  canEdit,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  canEditPathVertices = false,
  onEditPathVertices,
  canResetPivot = false,
  onResetPivot,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { left, top } = clampMenuPosition(menu.x, menu.y, rect.width, rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu.x, menu.y]);

  const items: Item[] = [
    { kind: "item", label: "コピー", shortcut: "Ctrl+C", disabled: !hasSelection, action: onCopy },
    { kind: "item", label: "切り取り", shortcut: "Ctrl+X", disabled: !hasSelection || !canEdit, action: onCut },
    { kind: "item", label: "貼り付け", shortcut: "Ctrl+V", disabled: !hasClipboard || !canEdit, action: onPaste },
    { kind: "sep" },
    { kind: "item", label: "複製", shortcut: "Ctrl+D", disabled: !hasSelection || !canEdit, action: onDuplicate },
    { kind: "item", label: "削除", shortcut: "Del", disabled: !hasSelection || !canEdit, action: onDelete },
    { kind: "item", label: "頂点を編集", disabled: !canEditPathVertices || !canEdit, action: () => onEditPathVertices?.() },
    { kind: "item", label: "基準点を図形の中心に戻す", disabled: !canResetPivot || !canEdit, action: () => onResetPivot?.() },
    { kind: "sep" },
    { kind: "item", label: "前面へ移動", disabled: !hasSelection || !canEdit, action: onBringToFront },
    { kind: "item", label: "背面へ移動", disabled: !hasSelection || !canEdit, action: onSendToBack },
  ];

  return createPortal(
    <div
      ref={ref}
      className="yo-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.kind === "sep" ? (
          <div key={`sep-${i}`} className="yo-context-sep" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="yo-context-item"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.action();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut ? (
              <span className="yo-context-kicker">{item.shortcut}</span>
            ) : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
