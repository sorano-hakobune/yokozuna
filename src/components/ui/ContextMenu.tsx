import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem =
  | {
      kind?: "item";
      label: string;
      shortcut?: string;
      disabled?: boolean;
      active?: boolean;
      action: () => void;
    }
  | { kind: "sep" }
  | { kind: "label"; label: string };

export type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  items?: ContextMenuItem[];
  children?: ReactNode;
  className?: string;
};

export function clampMenuPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  margin = 8,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (left + w > vw - margin) {
    left = Math.max(margin, x - w);
    if (left + w > vw - margin) left = Math.max(margin, vw - w - margin);
  }
  if (left < margin) left = margin;
  if (top + h > vh - margin) {
    top = Math.max(margin, y - h);
    if (top + h > vh - margin) top = Math.max(margin, vh - h - margin);
  }
  if (top < margin) top = margin;
  return { left, top };
}

export function ContextMenu({
  x,
  y,
  onClose,
  items,
  children,
  className = "yo-context-menu",
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { left, top } = clampMenuPosition(x, y, rect.width, rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items, children]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
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

  const style: CSSProperties = { left: x, top: y };

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={style}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children
        ? children
        : items?.map((item, i) => {
            if (item.kind === "sep") {
              return <div key={`sep-${i}`} className="yo-context-sep" />;
            }
            if (item.kind === "label") {
              return (
                <div key={`label-${i}`} className="menu-section-label">
                  {item.label}
                </div>
              );
            }
            return (
              <button
                key={`${item.label}-${i}`}
                type="button"
                role="menuitem"
                className={`yo-context-item${item.active ? " is-active" : ""}`}
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
            );
          })}
    </div>,
    document.body,
  );
}
